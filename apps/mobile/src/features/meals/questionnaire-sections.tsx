/**
 * One body component per iOS questionnaire step.
 *
 * Each section reads and writes `IosQuestionnaireAnswers`; the wizard folds
 * them into `PlanRequest` via `applyIosAnswers`, so what the user sees and
 * what gets posted to `POST /plans` can never drift apart.
 */
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  OptionGrid,
  PlaceholderQuestion,
  QuestionLabel,
  RadioRows,
  StepperControl,
  WarningNote,
} from '@/features/meals/questionnaire-controls';
import {
  PLACEHOLDER_QUESTIONS,
  QUESTIONNAIRE_STEPS,
  type IosQuestionnaireAnswers,
  type QuestionnaireStepId,
} from '@/features/meals/questionnaire-steps';

export type IosSectionProps = {
  answers: IosQuestionnaireAnswers;
  onPatch: (patch: Partial<IosQuestionnaireAnswers>) => void;
};

const gap = { gap: Spacing.three } as const;
const questionGap = { gap: Spacing.two } as const;

function stepQuestions(id: QuestionnaireStepId) {
  return QUESTIONNAIRE_STEPS.find((step) => step.id === id)!.questions;
}

function placeholdersAfter(id: QuestionnaireStepId) {
  return PLACEHOLDER_QUESTIONS.filter((placeholder) => placeholder.afterStep === id);
}

/** Step 1 — Your Household (Q1, Q2). */
export function HouseholdStepSection({ answers, onPatch }: IosSectionProps) {
  const [q1, q2] = stepQuestions('household');
  return (
    <View style={gap}>
      <View style={questionGap}>
        <QuestionLabel number={q1!.number} text={q1!.text} />
        <StepperControl
          value={answers.householdSize}
          min={q1!.stepperMin ?? 1}
          max={q1!.stepperMax ?? 8}
          onChange={(householdSize) =>
            onPatch({
              householdSize,
              children: Math.min(answers.children, householdSize),
            })
          }
          accessibilityLabel={q1!.text}
        />
      </View>
      <View style={questionGap}>
        <QuestionLabel number={q2!.number} text={q2!.text} />
        <StepperControl
          value={answers.children}
          min={q2!.stepperMin ?? 0}
          max={Math.min(q2!.stepperMax ?? 8, answers.householdSize)}
          onChange={(children) => onPatch({ children })}
          accessibilityLabel={q2!.text}
        />
      </View>
    </View>
  );
}

/** Step 2 — Diets & Restrictions (Q3, Q4, then placeholder Q5). */
export function DietsStepSection({ answers, onPatch }: IosSectionProps) {
  const [q3, q4] = stepQuestions('diets');
  return (
    <View style={gap}>
      <View style={questionGap}>
        <QuestionLabel number={q3!.number} text={q3!.text} />
        <OptionGrid
          options={q3!.options ?? []}
          selected={answers.diets}
          onChange={(diets) => onPatch({ diets })}
          columns={q3!.columns}
        />
      </View>
      <View style={questionGap}>
        <QuestionLabel number={q4!.number} text={q4!.text} />
        {q4!.warning ? <WarningNote text={q4!.warning} /> : null}
        <OptionGrid
          options={q4!.options ?? []}
          selected={answers.allergies}
          onChange={(allergies) => onPatch({ allergies })}
          columns={q4!.columns}
        />
      </View>
      {placeholdersAfter('diets').map((placeholder) => (
        <PlaceholderQuestion key={placeholder.number} number={placeholder.number} />
      ))}
    </View>
  );
}

/** Step 3 — Health & Goals (Q6, Q7). */
export function HealthStepSection({ answers, onPatch }: IosSectionProps) {
  const [q6, q7] = stepQuestions('health');
  return (
    <View style={gap}>
      <View style={questionGap}>
        <QuestionLabel number={q6!.number} text={q6!.text} />
        <OptionGrid
          options={q6!.options ?? []}
          selected={answers.healthConsiderations}
          onChange={(healthConsiderations) => onPatch({ healthConsiderations })}
          columns={q6!.columns}
        />
      </View>
      <View style={questionGap}>
        <QuestionLabel number={q7!.number} text={q7!.text} />
        <OptionGrid
          options={q7!.options ?? []}
          selected={answers.goals}
          onChange={(goals) => onPatch({ goals })}
          columns={q7!.columns}
        />
      </View>
    </View>
  );
}

/** Step 4 — Taste & Cooking (Q8, Q9, then placeholders Q10, Q11). */
export function TasteStepSection({ answers, onPatch }: IosSectionProps) {
  const [q8, q9] = stepQuestions('taste');
  return (
    <View style={gap}>
      <View style={questionGap}>
        <QuestionLabel number={q8!.number} text={q8!.text} />
        <OptionGrid
          options={q8!.options ?? []}
          selected={answers.cuisines}
          onChange={(cuisines) => onPatch({ cuisines })}
          columns={q8!.columns}
        />
      </View>
      <View style={questionGap}>
        <QuestionLabel number={q9!.number} text={q9!.text} />
        <RadioRows
          options={q9!.options ?? []}
          selected={answers.spiceLevel}
          onSelect={(spiceLevel) => onPatch({ spiceLevel })}
        />
      </View>
      {placeholdersAfter('taste').map((placeholder) => (
        <PlaceholderQuestion key={placeholder.number} number={placeholder.number} />
      ))}
    </View>
  );
}

/** Step 5 — Meal Planning & Budget (Q12, Q13, Q14). */
export function BudgetStepSection({ answers, onPatch }: IosSectionProps) {
  const [q12, q13, q14] = stepQuestions('budget');
  return (
    <View style={gap}>
      <View style={questionGap}>
        <QuestionLabel number={q12!.number} text={q12!.text} />
        <StepperControl
          value={answers.dinnersPerWeek}
          min={q12!.stepperMin ?? 1}
          max={q12!.stepperMax ?? 7}
          onChange={(dinnersPerWeek) => onPatch({ dinnersPerWeek })}
          accessibilityLabel={q12!.text}
        />
      </View>
      <View style={questionGap}>
        <QuestionLabel number={q13!.number} text={q13!.text} />
        <OptionGrid
          options={q13!.options ?? []}
          selected={answers.mealTypes}
          onChange={(mealTypes) =>
            onPatch({ mealTypes: mealTypes as IosQuestionnaireAnswers['mealTypes'] })
          }
          columns={q13!.columns}
        />
      </View>
      <View style={questionGap}>
        <QuestionLabel number={q14!.number} text={q14!.text} />
        <RadioRows
          options={q14!.options ?? []}
          selected={answers.budgetRange}
          onSelect={(value) =>
            onPatch({ budgetRange: value as IosQuestionnaireAnswers['budgetRange'] })
          }
        />
      </View>
    </View>
  );
}
