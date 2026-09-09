// Package benefits is the government-benefits domain: what a Help The Hive
// benefits profile is, what a form mapping is, and the rules that turn one into
// the other. It is pure — no database, no PDF, no network, no AI.
//
// One rule shapes every type here: an answer that was never given is never
// guessed. A profile field is not a string; it is a Value carrying an
// AnswerStatus, so "no income" and "income not yet asked" cannot collide. Only
// StatusProvided and StatusNone ever reach a PDF. StatusUnknown becomes a
// MissingField for the app to ask about, and a form with a required unknown
// cannot be approved.
//
// A wrong answer on a benefits application is a false statement to a government
// agency, made in the applicant's name. That is why this package would rather
// return "I do not know" than anything else.
package benefits

// One thing this package deliberately does not do: decide eligibility.
//
// There is no rule here that reads a household's income and concludes anything
// about whether they qualify for a program. Every threshold in benefits law is
// a matter of state rules, deductions and circumstances that change, and the
// only body whose answer counts is the agency running the programme. Help The
// Hive prepares a form; the agency decides.
//
// That boundary is worth holding even when a prediction would be easy. Telling
// somebody they probably qualify, and being wrong, costs them a month of
// waiting; telling them they probably do not, and being wrong, costs them the
// application entirely.
