package benefits

import (
	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// Guided application checklists: what to have ready before, during, and after
// applying for a benefits program.
//
// This is reference content only — preparation guidance, not program rules.
// It makes NO eligibility claims ("you qualify", "you are eligible"), states
// no benefit amounts, and invents no program rules. Anything that varies by
// state is marked confirmOnPortal=true, and its detail copy sends the
// applicant to their state's official portal to confirm. The one deadline
// pattern used throughout — "respond by the date on the notice" — refers to
// dates on the applicant's own notices, never to a rule stated here.
//
// The state argument only flavors the copy ("in Missouri", "your state's
// official portal"). An unrecognized state still gets the full checklist with
// generic wording: the checklist never refuses to help over a typo.

// ChecklistItem is one step in a checklist section.
type ChecklistItem struct {
	Label  string
	Detail *string
	// ConfirmOnPortal is true when the step is state-specific and must be
	// confirmed on the applicant's state's official portal.
	ConfirmOnPortal bool
}

// ChecklistSection is one before/during/after section of a checklist.
type ChecklistSection struct {
	// Phase is one of "before", "during", "after".
	Phase string
	Title string
	Items []ChecklistItem
}

func checklistItem(label, detail string, confirmOnPortal bool) ChecklistItem {
	return ChecklistItem{Label: label, Detail: &detail, ConfirmOnPortal: confirmOnPortal}
}

// Checklist returns the guided checklist for a program. It is pure reference
// data: no identity, no user data, no database.
func (s *Service) Checklist(program, state string) ([]ChecklistSection, error) {
	code, err := normalizeProgram(program)
	if err != nil {
		return nil, err
	}
	st, err := normalizeState(state)
	if err != nil {
		// The checklist is program-driven; a bad state just means generic
		// copy instead of naming the state.
		st = ""
	}
	stateName := "your state"
	if st != "" {
		stateName = stateNames[st]
	}
	portalCopy := "your state's official portal"

	switch code {
	case "SNAP":
		return []ChecklistSection{
			{
				Phase: "before", Title: "What to gather before you apply",
				Items: []ChecklistItem{
					checklistItem("Proof of identity",
						"A driver's license, state ID, or another photo ID for the person applying. Confirm exactly what "+stateName+" accepts on "+portalCopy+".", true),
					checklistItem("Proof of where you live",
						"A lease, mortgage statement, utility bill, or mail showing your current address. Confirm what counts on "+portalCopy+".", true),
					checklistItem("Proof of income",
						"Recent pay stubs or other proof of income for household members who work, plus letters for any other income such as Social Security or child support.", false),
					checklistItem("Proof of expenses",
						"Rent or mortgage, utility bills, child care costs, and out-of-pocket medical costs. The application may ask about these.", false),
					checklistItem("Social Security numbers",
						"For the household members who are applying, if they have one. The portal explains what to do when someone doesn't have one.", false),
				},
			},
			{
				Phase: "during", Title: "Filling out the application",
				Items: []ChecklistItem{
					checklistItem("Answer every required question",
						"An incomplete application can slow down a decision. Required fields are marked on the official form.", false),
					checklistItem("The interview",
						stateName+" may schedule a phone interview after you apply. Confirm how interviews work on "+portalCopy+", and keep your documents nearby for the call.", true),
					checklistItem("Sign and submit on the official portal",
						"Help The Hive prepares the paperwork; the application itself is submitted by you, on the state's official site, in your own session.", false),
				},
			},
			{
				Phase: "after", Title: "After you apply",
				Items: []ChecklistItem{
					checklistItem("Watch for the decision notice",
						"The agency sends its decision in writing. If you move, update your address with the agency right away so the notice reaches you.", false),
					checklistItem("Report changes",
						"Tell the agency about changes in income, household members, or address when your state requires it — check the reporting rules on "+portalCopy+".", true),
					checklistItem("Note your renewal date",
						"The approval notice shows how long the certification lasts. Help The Hive can remind you before it ends; the date on your notice is the one that counts.", false),
				},
			},
		}, nil
	case "WIC":
		return []ChecklistSection{
			{
				Phase: "before", Title: "What to gather before you apply",
				Items: []ChecklistItem{
					checklistItem("Proof of identity",
						"A driver's license, state ID, or another photo ID. Confirm exactly what "+stateName+" accepts on "+portalCopy+".", true),
					checklistItem("Proof of income",
						"The portal lists what counts as proof of income — confirm what "+stateName+" accepts on "+portalCopy+".", true),
					checklistItem("Proof of where you live",
						"A lease, utility bill, or mail showing your current address. Confirm what counts on "+portalCopy+".", true),
					checklistItem("Children's records, if you have them",
						"Immunization records for the children being enrolled. The portal says exactly what to bring — confirm on "+portalCopy+".", true),
				},
			},
			{
				Phase: "during", Title: "Applying",
				Items: []ChecklistItem{
					checklistItem("Book the appointment",
						"Enrollment usually involves an appointment at a local clinic. Check "+portalCopy+" for how appointments are scheduled in "+stateName+".", true),
					checklistItem("Bring everyone who is enrolling",
						"The appointment may need to include the children or infants being enrolled — confirm on "+portalCopy+".", true),
					checklistItem("Sign and submit on the official portal",
						"Help The Hive prepares the paperwork; the application itself is submitted by you, on the official site, in your own session.", false),
				},
			},
			{
				Phase: "after", Title: "After you apply",
				Items: []ChecklistItem{
					checklistItem("Ask how benefits are issued",
						"Your state will explain how benefits reach you — confirm the details on "+portalCopy+".", true),
					checklistItem("Keep your clinic appointments",
						"Stay in touch with the clinic about follow-up visits. Dates and requirements come from the clinic, not from this checklist.", false),
				},
			},
		}, nil
	case "MEDICAID":
		return []ChecklistSection{
			{
				Phase: "before", Title: "What to gather before you apply",
				Items: []ChecklistItem{
					checklistItem("Proof of identity and status",
						"A photo ID and the documents your state asks for about citizenship or immigration status — confirm the list on "+portalCopy+".", true),
					checklistItem("Proof of income",
						"Recent pay stubs, tax returns, or letters for other income such as Social Security or unemployment.", false),
					checklistItem("Current health coverage",
						"Information about any insurance you have now, including an employer plan or Medicare.", false),
					checklistItem("Social Security numbers",
						"For the household members who are applying, if they have one.", false),
				},
			},
			{
				Phase: "during", Title: "Filling out the application",
				Items: []ChecklistItem{
					checklistItem("Find where to apply",
						"Some states use their own portal and some use the federal marketplace — "+portalCopy+" says which one "+stateName+" uses.", true),
					checklistItem("Have information for the whole household",
						"Have information ready for everyone in the household, even people who aren't applying.", false),
					checklistItem("Answer every required question",
						"An incomplete application can slow down a decision. Required fields are marked on the official form.", false),
				},
			},
			{
				Phase: "after", Title: "After you apply",
				Items: []ChecklistItem{
					checklistItem("Choose a health plan if asked",
						"Some states ask you to pick a managed care plan after approval — the notice explains how.", false),
					checklistItem("Report changes",
						"Tell the agency about changes in income, household, or address when your state requires it — check the reporting rules on "+portalCopy+".", true),
					checklistItem("Note your renewal date",
						"Coverage is renewed periodically. The date on your notice is the one that counts; Help The Hive can remind you before it ends.", false),
				},
			},
		}, nil
	case "LIHEAP":
		return []ChecklistSection{
			{
				Phase: "before", Title: "What to gather before you apply",
				Items: []ChecklistItem{
					checklistItem("Recent utility bills",
						"The bill for the heating or cooling you need help with, showing the account holder and the amount due.", false),
					checklistItem("Proof of income",
						"Recent pay stubs or other proof of household income.", false),
					checklistItem("Proof of identity and address",
						"A photo ID and something showing your current address — confirm exactly what "+stateName+" accepts on "+portalCopy+".", true),
				},
			},
			{
				Phase: "during", Title: "Applying",
				Items: []ChecklistItem{
					checklistItem("Check the application window",
						"LIHEAP often opens for limited seasons. Confirm the dates for "+stateName+" on "+portalCopy+" before you start.", true),
					checklistItem("Apply for the right kind of help",
						"Heating, cooling, and crisis help can be separate. Confirm what "+stateName+" offers on "+portalCopy+".", true),
					checklistItem("Sign and submit on the official portal",
						"Help The Hive prepares the paperwork; the application itself is submitted by you, on the official site, in your own session.", false),
				},
			},
			{
				Phase: "after", Title: "After you apply",
				Items: []ChecklistItem{
					checklistItem("Ask how the benefit is delivered",
						"In many states the payment goes straight to the utility company. Confirm how it works in "+stateName+" on "+portalCopy+".", true),
					checklistItem("If you're facing a shutoff, say so",
						"Ask about crisis assistance if your heat is shut off or you're nearly out of fuel — confirm availability on "+portalCopy+".", true),
				},
			},
		}, nil
	case "TANF":
		return []ChecklistSection{
			{
				Phase: "before", Title: "What to gather before you apply",
				Items: []ChecklistItem{
					checklistItem("Proof of identity",
						"A driver's license, state ID, or another photo ID. Confirm exactly what "+stateName+" accepts on "+portalCopy+".", true),
					checklistItem("Proof of income and assets",
						"Pay stubs, bank statements, and information about vehicles or other assets the application asks about.", false),
					checklistItem("Children's documents",
						"Birth certificates or other proof of the children's ages and relationship to you — confirm what "+stateName+" accepts on "+portalCopy+".", true),
					checklistItem("Proof of where you live",
						"A lease, utility bill, or mail showing your current address. Confirm what counts on "+portalCopy+".", true),
				},
			},
			{
				Phase: "during", Title: "Applying",
				Items: []ChecklistItem{
					checklistItem("The interview",
						stateName+" may require a phone or in-person interview — confirm how it works on "+portalCopy+", and keep your documents nearby.", true),
					checklistItem("Ask about ongoing requirements",
						"Ongoing requirements differ by state. Ask what yours are, get them in writing, and confirm the details on "+portalCopy+".", true),
					checklistItem("Sign and submit on the official portal",
						"Help The Hive prepares the paperwork; the application itself is submitted by you, on the official site, in your own session.", false),
				},
			},
			{
				Phase: "after", Title: "After you apply",
				Items: []ChecklistItem{
					checklistItem("Keep up with reporting",
						"Report changes in income, household, or address when your state requires it — confirm the rules on "+portalCopy+".", true),
					checklistItem("Note the date on every notice",
						"Respond by the date printed on each notice you receive.", false),
				},
			},
		}, nil
	case "VA":
		return []ChecklistSection{
			{
				Phase: "before", Title: "What to gather before you file",
				Items: []ChecklistItem{
					checklistItem("Service records",
						"Your discharge papers if you have them. The portal explains what to do if you don't.", false),
					checklistItem("Medical records",
						"Records from VA and private doctors about the conditions you're claiming, plus a list of providers and treatment dates.", false),
					checklistItem("Dependent information",
						"Marriage certificate, children's birth certificates, and Social Security numbers for dependents, if you're claiming them.", false),
				},
			},
			{
				Phase: "during", Title: "Filing",
				Items: []ChecklistItem{
					checklistItem("File on VA.gov",
						"Disability compensation, pension, and health care each have their own application on VA.gov — file the one that matches what you're seeking.", false),
					checklistItem("Pick the right claim path",
						"If you've filed before, a new claim, a supplemental claim, and a higher-level review are different paths — the portal explains the difference.", false),
					checklistItem("Attend the C&P exam if one is scheduled",
						"VA may schedule a compensation and pension exam as part of a disability claim. Attend it, or reschedule through VA if you can't make it.", false),
				},
			},
			{
				Phase: "after", Title: "After you file",
				Items: []ChecklistItem{
					checklistItem("Track your claim",
						"Check the claim status on VA.gov and respond to any requests for evidence by the date given.", false),
					checklistItem("Read the decision letter",
						"VA sends the decision in writing, with the reasons and what to do if you disagree.", false),
				},
			},
		}, nil
	case "SSI":
		return []ChecklistSection{
			{
				Phase: "before", Title: "What to gather before you apply",
				Items: []ChecklistItem{
					checklistItem("Proof of identity and age",
						"A birth certificate or other proof of age, plus your Social Security number.", false),
					checklistItem("Work history",
						"Names and dates of jobs going back as far as the application asks — check the application for how far.", false),
					checklistItem("Medical records and provider list",
						"Names, addresses, and treatment dates for every doctor, hospital, and clinic, plus the medications you take.", false),
					checklistItem("Financial records",
						"Bank statements and information about income, assets, and living arrangements the application asks about.", false),
				},
			},
			{
				Phase: "during", Title: "Applying",
				Items: []ChecklistItem{
					checklistItem("The SSA interview",
						"SSA may contact you for an interview or to request records after you apply. Respond by the date they give.", false),
					checklistItem("Keep copies of everything",
						"Keep a copy of the application and every document you send.", false),
					checklistItem("Sign and submit on the official portal",
						"Help The Hive prepares the paperwork; the application itself is submitted by you, on the official site, in your own session.", false),
				},
			},
			{
				Phase: "after", Title: "After you apply",
				Items: []ChecklistItem{
					checklistItem("Read the decision letter",
						"SSA sends the decision in writing. If you disagree, the notice explains how to appeal.", false),
					checklistItem("Don't miss the appeal date",
						"If you appeal, do it by the date on the notice.", false),
					checklistItem("Report changes",
						"Tell SSA about changes in income, resources, address, or household when required — the notice explains how.", false),
				},
			},
		}, nil
	}
	return nil, domain.ErrNotFound
}
