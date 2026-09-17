package benefits

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/secrets"
	"github.com/helpthehive/server/internal/modules/users"
)

// DraftRetention is how long a draft PDF is kept before the retention sweep
// removes it. Drafts are regenerated on demand from the profile, so keeping
// them around is convenience, not a record — and every extra day is another day
// a household's application sits on disk.
const DraftRetention = 30 * 24 * time.Hour

// Application states. A run is durable: it can be left, resumed, refilled and
// finished later, and the app never has to start again because it closed.
const (
	// StatusDraft: created, not yet filled.
	StatusDraft = "draft"
	// StatusNeedsInformation: filled as far as the profile allows; the app must
	// ask the questions in the run's missing fields.
	StatusNeedsInformation = "needs_information"
	// StatusReadyForReview: nothing required is outstanding; awaiting the
	// applicant's own read-through.
	StatusReadyForReview = "ready_for_review"
	// StatusCompleted: the applicant approved it and the PDF is flattened.
	StatusCompleted = "completed"
	// StatusFailed: a fill or a render failed. The reason is stored with the
	// run so it can be found later; refilling clears it.
	StatusFailed = "failed"
	// StatusSuperseded: replaced by a newer run against the same form.
	StatusSuperseded = "superseded"
)

// Service is the benefits system's entry point.
//
// Every method resolves the viewer from the verified token and scopes its work
// to that user. No method accepts a user id from the caller, and anything the
// viewer may not see is reported as not found rather than forbidden: telling
// somebody that another person's application exists is itself a disclosure.
type Service struct {
	store     *db.Store
	users     *users.Service
	registry  *Registry
	documents DocumentStore
	cipher    *secrets.Cipher
	logger    *slog.Logger
	now       func() time.Time
}

func NewService(
	store *db.Store,
	usersService *users.Service,
	registry *Registry,
	documents DocumentStore,
	cipher *secrets.Cipher,
	logger *slog.Logger,
) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	if registry == nil {
		registry = NewRegistry()
	}
	return &Service{
		store:     store,
		users:     usersService,
		registry:  registry,
		documents: documents,
		cipher:    cipher,
		logger:    logger,
		now:       time.Now,
	}
}

func (s *Service) userID(ctx context.Context, identity auth.Identity) (string, error) {
	viewer, err := s.users.Viewer(ctx, identity)
	if err != nil {
		return "", err
	}
	return viewer.User.ID, nil
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

// Forms lists the government forms this server can fill. It holds no user data,
// so it is the one benefits query that is the same for everybody.
func (s *Service) Forms(state, program string) []*Form {
	return s.registry.List(state, program)
}

func (s *Service) Form(formID string) (*Form, error) {
	form, ok := s.registry.Current(formID)
	if !ok {
		return nil, domain.ErrNotFound
	}
	return form, nil
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

// AnswerInput is one answer arriving from the app. It carries no kind: the
// vocabulary decides what shape an answer must be, so the client cannot
// mis-declare one, and a value in the wrong field is rejected rather than
// stored.
type AnswerInput struct {
	FieldPath  string
	RowID      string
	Status     string
	Text       *string
	Number     *float64
	MoneyCents *int64
	Date       *string
	Bool       *bool
	List       []string
}

// GroupRowInput is one entry of a repeating group. An empty RowID means a new
// row; the service assigns the id.
type GroupRowInput struct {
	RowID   string
	Answers []AnswerInput
}

// Profile returns the viewer's benefits profile.
func (s *Service) Profile(ctx context.Context, identity auth.Identity) (*domain.Profile, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	return s.loadProfile(ctx, userID)
}

// SaveAnswers records scalar answers and returns the updated profile.
func (s *Service) SaveAnswers(ctx context.Context, identity auth.Identity, inputs []AnswerInput) (*domain.Profile, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	if err := s.store.EnsureBenefitsProfile(ctx, userID, domain.VocabularyVersion); err != nil {
		return nil, err
	}

	rows := make([]db.BenefitsAnswer, 0, len(inputs))
	for _, input := range inputs {
		path := domain.FieldPath(input.FieldPath)
		if path.Repeating() || input.RowID != "" {
			return nil, fmt.Errorf("%s belongs to a repeating group; save it with the group", path)
		}
		value, err := valueFromInput(path, input)
		if err != nil {
			return nil, err
		}
		// Validated through the domain before it is stored, so the database
		// never holds an answer the vocabulary would refuse.
		if err := domain.NewProfile(userID).Set(path, value); err != nil {
			return nil, err
		}
		row, err := s.rowFromValue(userID, path, "", value)
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}

	if err := s.store.UpsertBenefitsAnswers(ctx, userID, rows); err != nil {
		return nil, err
	}
	return s.loadProfile(ctx, userID)
}

// SaveGroup replaces a repeating group. Passing no rows is how a household says
// "none of these" — a real answer, recorded as such, and not the same as never
// having been asked.
func (s *Service) SaveGroup(ctx context.Context, identity auth.Identity, groupPath string, inputs []GroupRowInput) (*domain.Profile, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	group := domain.FieldPath(groupPath)
	if !isRepeatingGroupPath(group) {
		return nil, fmt.Errorf("%q is not a repeating group", groupPath)
	}
	if err := s.store.EnsureBenefitsProfile(ctx, userID, domain.VocabularyVersion); err != nil {
		return nil, err
	}

	// Built as a domain group first so the whole thing is validated before any
	// of it is written.
	validation := domain.NewProfile(userID)
	var (
		groupRows  []db.BenefitsGroupRow
		answers    []db.BenefitsAnswer
		domainRows []domain.GroupRow
	)

	for position, input := range inputs {
		rowID := strings.TrimSpace(input.RowID)
		if rowID == "" {
			rowID = db.NewID()
		}
		domainRow := domain.NewGroupRow(rowID)
		for _, answer := range input.Answers {
			path := domain.FieldPath(answer.FieldPath)
			owner, isMember := path.GroupPath()
			if !isMember || owner != group {
				return nil, fmt.Errorf("%s does not belong to %s", path, group)
			}
			value, err := valueFromInput(path, answer)
			if err != nil {
				return nil, err
			}
			domainRow.Values[path.Template()] = value
		}
		domainRows = append(domainRows, domainRow)
		groupRows = append(groupRows, db.BenefitsGroupRow{
			GroupPath: groupPath, RowID: rowID, Position: position,
		})
	}

	if err := validation.SetGroup(group, domainRows); err != nil {
		return nil, err
	}

	for _, row := range domainRows {
		for path, value := range row.Values {
			stored, err := s.rowFromValue(userID, path, row.ID, value)
			if err != nil {
				return nil, err
			}
			answers = append(answers, stored)
		}
	}
	// The group's own declaration row: it is what records that the question was
	// asked at all.
	declaration, err := s.rowFromValue(userID, group, "", validation.Get(group))
	if err != nil {
		return nil, err
	}
	declaration.GroupPath = ""

	if err := s.store.ReplaceBenefitsGroup(ctx, userID, groupPath, groupRows, answers); err != nil {
		return nil, err
	}
	if err := s.store.UpsertBenefitsAnswers(ctx, userID, []db.BenefitsAnswer{declaration}); err != nil {
		return nil, err
	}
	return s.loadProfile(ctx, userID)
}

func valueFromInput(path domain.FieldPath, input AnswerInput) (domain.Value, error) {
	spec, ok := domain.Lookup(path)
	if !ok {
		return domain.Unknown(), fmt.Errorf("%w: %s", domain.ErrUnknownFieldPath, path)
	}
	status := domain.AnswerStatus(input.Status)
	if status == "" {
		status = domain.StatusProvided
	}
	switch status {
	case domain.StatusUnknown:
		return domain.Unknown(), nil
	case domain.StatusRefused:
		return domain.Refused(spec.Kind), nil
	case domain.StatusNone:
		return domain.None(spec.Kind, domain.SourceUser), nil
	case domain.StatusProvided:
	default:
		return domain.Unknown(), fmt.Errorf("%s: unknown answer status %q", path, input.Status)
	}

	missing := func() (domain.Value, error) {
		return domain.Unknown(), fmt.Errorf("%s expects %s, but no value of that kind was given", path, spec.Kind)
	}

	switch spec.Kind {
	case domain.KindText:
		if input.Text == nil {
			return missing()
		}
		return domain.Text(strings.TrimSpace(*input.Text), domain.SourceUser), nil
	case domain.KindChoice:
		if input.Text == nil {
			return missing()
		}
		return domain.Choice(strings.TrimSpace(*input.Text), domain.SourceUser), nil
	case domain.KindNumber:
		if input.Number == nil {
			return missing()
		}
		return domain.Number(*input.Number, domain.SourceUser), nil
	case domain.KindMoney:
		if input.MoneyCents == nil {
			return missing()
		}
		return domain.Money(*input.MoneyCents, domain.SourceUser), nil
	case domain.KindDate:
		if input.Date == nil {
			return missing()
		}
		parsed, err := time.Parse(time.DateOnly, strings.TrimSpace(*input.Date))
		if err != nil {
			return domain.Unknown(), fmt.Errorf("%s expects a YYYY-MM-DD date", path)
		}
		return domain.Date(parsed, domain.SourceUser), nil
	case domain.KindBoolean:
		if input.Bool == nil {
			return missing()
		}
		return domain.Bool(*input.Bool, domain.SourceUser), nil
	case domain.KindList:
		if input.List == nil {
			return missing()
		}
		return domain.List(input.List, domain.SourceUser), nil
	}
	return domain.Unknown(), fmt.Errorf("%s has an unsupported kind %q", path, spec.Kind)
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

// Application is one autofill run as the app sees it.
type Application struct {
	Record db.BenefitsApplication
	Form   *Form
	// Resolution is what would be written today, for a run that is still open.
	// It is empty for an approved application: what an applicant signed must be
	// read from the document they approved, not recomputed from a profile they
	// may have edited since.
	Resolution domain.Resolution
	// AuditFields is the stored trail of which answer fed which box. It carries
	// no values.
	AuditFields []db.BenefitsApplicationField
	HasDraft    bool
	HasFinal    bool
}

func (a Application) Status() string { return a.Record.Status }

// StartApplication begins a run against the current revision of a form.
func (s *Service) StartApplication(ctx context.Context, identity auth.Identity, formID string) (Application, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Application{}, err
	}
	form, ok := s.registry.Current(strings.TrimSpace(formID))
	if !ok {
		return Application{}, domain.ErrNotFound
	}

	record, err := s.store.CreateBenefitsApplication(ctx, db.BenefitsApplication{
		UserID:       userID,
		FormID:       form.Mapping.ID,
		FormVersion:  form.Mapping.FormVersion,
		FormRevision: form.Mapping.Revision,
		Status:       StatusDraft,
	})
	if err != nil {
		return Application{}, err
	}
	// One open run per form: the previous drafts are noise, and an applicant
	// with three half-filled copies of the same form is a support ticket.
	if err := s.store.SupersedeBenefitsApplications(ctx, userID, form.Mapping.ID, record.ID); err != nil {
		return Application{}, err
	}

	return s.fill(ctx, userID, record, form)
}

// Refill re-runs an application against the profile as it stands now. It always
// uses the exact form revision the application was started on: a state revising
// its form must not silently change what an applicant already reviewed.
func (s *Service) Refill(ctx context.Context, identity auth.Identity, applicationID string) (Application, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Application{}, err
	}
	record, err := s.store.BenefitsApplication(ctx, userID, strings.TrimSpace(applicationID))
	if db.IsNotFound(err) {
		return Application{}, domain.ErrNotFound
	}
	if err != nil {
		return Application{}, err
	}
	if record.Status == StatusCompleted {
		return Application{}, domain.ErrAlreadyApproved
	}
	form, err := s.formFor(record)
	if err != nil {
		return Application{}, err
	}
	return s.fill(ctx, userID, record, form)
}

// fill resolves the profile against the mapping, renders the draft, and records
// the outcome. It writes no values into the audit trail — only which path fed
// which box.
func (s *Service) fill(ctx context.Context, userID string, record db.BenefitsApplication, form *Form) (Application, error) {
	profile, err := s.loadProfile(ctx, userID)
	if err != nil {
		return Application{}, err
	}

	resolution := domain.Resolve(profile, form.Mapping)

	// A failure to render is recorded on the run rather than only returned.
	// Otherwise an application that cannot be produced sits at whatever status
	// it had before, the applicant is told nothing, and nobody can find it
	// again to see why.
	rendered, err := RenderDraft(form, resolution)
	if err != nil {
		return s.recordFailure(ctx, userID, record, form, resolution, "draft", err)
	}
	resolution.Problems = append(resolution.Problems, rendered.Problems...)

	document, err := s.saveDocument(ctx, userID, record.ID, "draft", rendered.Bytes, false)
	if err != nil {
		return s.recordFailure(ctx, userID, record, form, resolution, "draft", err)
	}

	status := StatusReadyForReview
	if resolution.NeedsInput() {
		status = StatusNeedsInformation
	}
	if err := s.store.SaveBenefitsApplicationOutcome(ctx, userID, record.ID, status, "", nil, auditFields(resolution)); err != nil {
		return Application{}, err
	}
	record.Status = status
	record.FailureReason = ""

	s.logger.Info("benefits application filled",
		"application_id", record.ID,
		"form", form.Key(),
		"status", status,
		"filled", len(resolution.Filled),
		"missing", len(resolution.Missing),
		"problems", len(resolution.Problems),
		"document_sha256", document.SHA256,
	)

	return Application{
		Record:      record,
		Form:        form,
		Resolution:  resolution,
		AuditFields: auditFields(resolution),
		HasDraft:    true,
	}, nil
}

// Approve finalises an application: it flattens the document the applicant
// reviewed and locks the record.
//
// An application with a required answer still missing, or with a field that
// could not be written, cannot be approved. Submitting an incomplete or
// mangled benefits form is worse for the applicant than not submitting one.
func (s *Service) Approve(ctx context.Context, identity auth.Identity, applicationID string) (Application, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Application{}, err
	}
	record, err := s.store.BenefitsApplication(ctx, userID, strings.TrimSpace(applicationID))
	if db.IsNotFound(err) {
		return Application{}, domain.ErrNotFound
	}
	if err != nil {
		return Application{}, err
	}
	if record.Status == StatusCompleted {
		return Application{}, domain.ErrAlreadyApproved
	}
	form, err := s.formFor(record)
	if err != nil {
		return Application{}, err
	}

	profile, err := s.loadProfile(ctx, userID)
	if err != nil {
		return Application{}, err
	}
	resolution := domain.Resolve(profile, form.Mapping)
	if !resolution.Ready() {
		return Application{}, domain.ErrNotReady
	}

	rendered, err := RenderFinal(form, resolution)
	if err != nil {
		if _, failErr := s.recordFailure(ctx, userID, record, form, resolution, "final", err); failErr != nil {
			return Application{}, failErr
		}
		return Application{}, fmt.Errorf("render final: %w", err)
	}
	if len(rendered.Problems) > 0 {
		resolution.Problems = append(resolution.Problems, rendered.Problems...)
		return Application{}, domain.ErrNotReady
	}

	// A final document has no purge date: it is the record of what somebody
	// signed, and it is theirs until they delete it.
	document, err := s.saveDocument(ctx, userID, record.ID, "final", rendered.Bytes, true)
	if err != nil {
		return Application{}, err
	}

	approvedAt := s.now().UTC()
	if err := s.store.SaveBenefitsApplicationOutcome(ctx, userID, record.ID, StatusCompleted, "", &approvedAt, auditFields(resolution)); err != nil {
		return Application{}, err
	}
	record.Status = StatusCompleted
	record.ApprovedAt = &approvedAt

	s.logger.Info("benefits application approved",
		"application_id", record.ID,
		"form", form.Key(),
		"document_sha256", document.SHA256,
	)

	// Schedule the renewal reminder off the rule-derived certification period.
	// This must never fail the approval: the flattened document is the record,
	// and the reminder is auxiliary.
	s.scheduleRenewal(ctx, userID, record, form, approvedAt)

	return Application{
		Record:      record,
		Form:        form,
		AuditFields: auditFields(resolution),
		HasDraft:    true,
		HasFinal:    true,
	}, nil
}

// Application returns one run.
func (s *Service) Application(ctx context.Context, identity auth.Identity, applicationID string) (Application, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return Application{}, err
	}
	record, err := s.store.BenefitsApplication(ctx, userID, strings.TrimSpace(applicationID))
	if db.IsNotFound(err) {
		return Application{}, domain.ErrNotFound
	}
	if err != nil {
		return Application{}, err
	}
	return s.view(ctx, userID, record)
}

func (s *Service) Applications(ctx context.Context, identity auth.Identity) ([]Application, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, err
	}
	records, err := s.store.ListBenefitsApplications(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]Application, 0, len(records))
	for _, record := range records {
		view, err := s.view(ctx, userID, record)
		if err != nil {
			return nil, err
		}
		out = append(out, view)
	}
	return out, nil
}

func (s *Service) view(ctx context.Context, userID string, record db.BenefitsApplication) (Application, error) {
	form, err := s.formFor(record)
	if err != nil {
		return Application{}, err
	}
	fields, err := s.store.BenefitsApplicationFields(ctx, userID, record.ID)
	if err != nil {
		return Application{}, err
	}

	view := Application{Record: record, Form: form, AuditFields: fields}
	if _, err := s.store.LatestBenefitsDocument(ctx, userID, record.ID, "draft"); err == nil {
		view.HasDraft = true
	}
	if _, err := s.store.LatestBenefitsDocument(ctx, userID, record.ID, "final"); err == nil {
		view.HasFinal = true
	}

	// An approved application is a record, not a live view: its resolution is
	// deliberately left empty so the app cannot show today's profile as though
	// it were what somebody signed.
	if record.Status != StatusCompleted {
		profile, err := s.loadProfile(ctx, userID)
		if err != nil {
			return Application{}, err
		}
		view.Resolution = domain.Resolve(profile, form.Mapping)
	}
	return view, nil
}

func (s *Service) DeleteApplication(ctx context.Context, identity auth.Identity, applicationID string) (bool, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return false, err
	}
	documents, err := s.store.BenefitsDocumentsForUser(ctx, userID)
	if err != nil {
		return false, err
	}
	for _, document := range documents {
		if document.ApplicationID != applicationID {
			continue
		}
		if err := s.documents.Delete(ctx, document.StorageKey); err != nil {
			return false, err
		}
	}
	return s.store.DeleteBenefitsApplication(ctx, userID, applicationID)
}

// Document returns a generated PDF for the viewer.
func (s *Service) Document(ctx context.Context, identity auth.Identity, applicationID, kind string) ([]byte, db.BenefitsDocument, error) {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return nil, db.BenefitsDocument{}, err
	}
	record, err := s.store.LatestBenefitsDocument(ctx, userID, strings.TrimSpace(applicationID), kind)
	if db.IsNotFound(err) {
		return nil, db.BenefitsDocument{}, domain.ErrNotFound
	}
	if err != nil {
		return nil, db.BenefitsDocument{}, err
	}
	data, err := s.documents.Get(ctx, record.StorageKey)
	if err != nil {
		return nil, db.BenefitsDocument{}, err
	}
	if digestOf(data) != record.SHA256 {
		// The stored bytes are not the bytes that were produced. Serving them
		// anyway would hand somebody a document nobody approved.
		return nil, db.BenefitsDocument{}, errors.New("the stored document does not match its recorded hash")
	}
	return data, record, nil
}

// PurgeDocumentsForViewer removes every generated PDF the viewer owns. It is
// called before an account is deleted: the database rows go by cascade, but the
// files would otherwise be left behind.
func (s *Service) PurgeDocumentsForViewer(ctx context.Context, identity auth.Identity) error {
	userID, err := s.userID(ctx, identity)
	if err != nil {
		return err
	}
	return s.PurgeUserDocuments(ctx, userID)
}

// PurgeUserDocuments deletes every generated PDF a user owns. Deleting an
// account removes the database rows by cascade; the files have to be removed
// too, or an account deletion leaves the household's application on disk.
func (s *Service) PurgeUserDocuments(ctx context.Context, userID string) error {
	documents, err := s.store.BenefitsDocumentsForUser(ctx, userID)
	if err != nil {
		return err
	}
	for _, document := range documents {
		if err := s.documents.Delete(ctx, document.StorageKey); err != nil {
			return err
		}
	}
	return nil
}

// PurgeExpiredDocuments removes drafts past their retention date.
func (s *Service) PurgeExpiredDocuments(ctx context.Context, limit int) (int, error) {
	expired, err := s.store.ExpiredBenefitsDocuments(ctx, s.now().UTC(), limit)
	if err != nil {
		return 0, err
	}
	for _, document := range expired {
		if err := s.documents.Delete(ctx, document.StorageKey); err != nil {
			return 0, err
		}
		if err := s.store.DeleteBenefitsDocument(ctx, document.ID); err != nil {
			return 0, err
		}
	}
	return len(expired), nil
}

func (s *Service) saveDocument(ctx context.Context, userID, applicationID, kind string, data []byte, flattened bool) (db.BenefitsDocument, error) {
	// The storage key is unique per document row, not per application. A
	// refill inserts a new row, and the retention sweep deletes expired rows
	// by key — a shared key would let the sweep delete a newer draft's PDF
	// while its row still references it.
	key := documentKey(userID, applicationID, kind+"-"+db.NewID())
	if err := s.documents.Put(ctx, key, data); err != nil {
		return db.BenefitsDocument{}, err
	}

	document := db.BenefitsDocument{
		ApplicationID: applicationID,
		UserID:        userID,
		Kind:          kind,
		StorageKey:    key,
		SHA256:        digestOf(data),
		ByteSize:      int64(len(data)),
		IsFlattened:   flattened,
	}
	if kind == "draft" {
		purgeAfter := s.now().UTC().Add(DraftRetention)
		document.PurgeAfter = &purgeAfter
	}
	return s.store.InsertBenefitsDocument(ctx, document)
}

// recordFailure marks a run failed and stores why, so an application that could
// not be produced is visible rather than silently stuck.
//
// The reason is a message about the form, never about an answer: it says "this
// value will not fit its box", not what the value was.
func (s *Service) recordFailure(
	ctx context.Context,
	userID string,
	record db.BenefitsApplication,
	form *Form,
	resolution domain.Resolution,
	stage string,
	cause error,
) (Application, error) {
	reason := fmt.Sprintf("%s document could not be produced: %v", stage, cause)

	s.logger.Error("benefits application failed",
		"application_id", record.ID, "form", form.Key(), "stage", stage, "error", cause)

	if err := s.store.SaveBenefitsApplicationOutcome(
		ctx, userID, record.ID, StatusFailed, reason, nil, auditFields(resolution)); err != nil {
		return Application{}, err
	}
	record.Status = StatusFailed
	record.FailureReason = reason

	return Application{
		Record:      record,
		Form:        form,
		Resolution:  resolution,
		AuditFields: auditFields(resolution),
	}, fmt.Errorf("%s: %w", reason, cause)
}

func (s *Service) formFor(record db.BenefitsApplication) (*Form, error) {
	key := fmt.Sprintf("%s@%s#%d", record.FormID, record.FormVersion, record.FormRevision)
	form, ok := s.registry.ByKey(key)
	if !ok {
		return nil, fmt.Errorf("the mapping this application was filled from (%s) is no longer installed on this server", key)
	}
	return form, nil
}

// auditFields turns a resolution into the trail stored against an application.
// It records the field id, the outcome and the path the value came from — never
// the value.
func auditFields(resolution domain.Resolution) []db.BenefitsApplicationField {
	fields := make([]db.BenefitsApplicationField, 0,
		len(resolution.Filled)+len(resolution.Problems)+len(resolution.Skipped))

	for _, filled := range resolution.Filled {
		fields = append(fields, db.BenefitsApplicationField{
			FieldID:     filled.FieldID,
			Outcome:     "filled",
			FieldPath:   string(filled.FieldPath),
			ValueSource: string(filled.Source),
			Page:        filled.Page,
			IsSensitive: filled.Sensitive,
		})
	}
	for _, problem := range resolution.Problems {
		fields = append(fields, db.BenefitsApplicationField{
			FieldID:   problem.FieldID,
			Outcome:   "problem",
			FieldPath: string(problem.FieldPath),
			Detail:    problem.Reason,
		})
	}
	for _, skipped := range resolution.Skipped {
		fields = append(fields, db.BenefitsApplicationField{
			FieldID: skipped.FieldID,
			Outcome: "skipped",
			Detail:  string(skipped.Reason),
		})
	}
	for _, missing := range resolution.Missing {
		for _, fieldID := range missing.FormFieldIDs {
			fields = append(fields, db.BenefitsApplicationField{
				FieldID:     fieldID,
				Outcome:     "missing",
				FieldPath:   string(missing.FieldPath),
				IsSensitive: missing.Sensitive,
			})
		}
	}

	sort.SliceStable(fields, func(i, j int) bool { return fields[i].FieldID < fields[j].FieldID })
	return dedupeByFieldID(fields)
}

// dedupeByFieldID keeps one row per form field. A field can be reported both as
// filled and, through another path, as missing; the primary key is the field,
// so the first outcome after sorting wins.
func dedupeByFieldID(fields []db.BenefitsApplicationField) []db.BenefitsApplicationField {
	out := fields[:0]
	seen := map[string]bool{}
	for _, field := range fields {
		if seen[field.FieldID] {
			continue
		}
		seen[field.FieldID] = true
		out = append(out, field)
	}
	return out
}
