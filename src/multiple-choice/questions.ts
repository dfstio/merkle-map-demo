import { Field, Packed, Bool } from "o1js";
import { hashWithPrefix, stringToFields } from "../lib/hash";
import { AnswerData } from "./contract";

export type MultipleChoiceQuestionType = "singleSelect" | "multiSelect";

export interface Question {
  type: MultipleChoiceQuestionType;
  question: string;
  htmlQuestion?: string;
  answers: string[];
  rightAnswers: boolean[];
}

export interface MultipleChoiceAnswer {
  choices: boolean[]; // Array of choices for question
}

export interface TestAnswer {
  answers: MultipleChoiceAnswer[]; // Array of answers for each question
  questionsCommitment: Field;
}

export interface FullAnswer {
  answer: TestAnswer;
  data: AnswerData;
}

export interface Grade {
  address: string;
  grade: string;
}

export function generateQuestions(
  numberOfQuestions: number,
  numberOfChoices: number
): Question[] {
  const questions: Question[] = [];
  for (let i = 0; i < numberOfQuestions; i++) {
    const type = i % 2 === 0 ? "singleSelect" : "multiSelect";
    const question = `Question ${i + 1}`;
    const answers: string[] = [];
    for (let j = 0; j < numberOfChoices; j++) {
      answers.push(`Answer ${j + 1}`);
    }
    const rightAnswers: boolean[] = [];
    for (let j = 0; j < numberOfChoices; j++) {
      rightAnswers.push(j === 0);
    }
    questions.push({ type, question, answers, rightAnswers });
  }
  return questions;
}

export function generateAnswers(
  questions: Question[],
  questionsCommitment: Field,
  quantity: number,
  valid: boolean
): TestAnswer[] {
  const answers: TestAnswer[] = [];
  for (let i = 0; i < quantity; i++) {
    const answer: TestAnswer = { answers: [], questionsCommitment };
    for (const question of questions) {
      const choices: boolean[] = [];
      for (let i = 0; i < question.answers.length; i++) {
        choices.push(valid ? i === 0 : i !== 0);
      }
      answer.answers.push({ choices });
    }
    answers.push(answer);
  }

  return answers;
}

export function validateQuestions(questions: Question[]) {
  for (const question of questions) {
    if (question.type !== "singleSelect" && question.type !== "multiSelect") {
      return false;
    }
    if (question.answers.length !== question.rightAnswers.length) {
      return false;
    }
    let rightAnswers = 0;
    for (const rightAnswer of question.rightAnswers) {
      if (rightAnswer) {
        rightAnswers++;
      }
    }
    if (rightAnswers === 0) {
      return false;
    }
    if (question.type === "singleSelect" && rightAnswers > 1) {
      return false;
    }
  }
  return true;
}

const PackedBool = Packed.create(Bool);

export function calculateQuestionsCommitment(
  questions: Question[],
  prefix: string
): Field {
  if (!validateQuestions(questions))
    throw new Error("calculateQuestionsCommitment: Invalid questions");
  const fields: Field[] = [Field(questions.length)];
  for (const question of questions) {
    fields.push(...stringToFields(question.type));
    fields.push(...stringToFields(question.question));
    fields.push(...stringToFields(question.htmlQuestion ?? ""));
    fields.push(Field(question.answers.length));
    for (const answer of question.answers) {
      fields.push(...stringToFields(answer));
    }
    fields.push(Field(question.rightAnswers.length));
    for (const rightAnswer of question.rightAnswers) {
      fields.push(rightAnswer ? Field(1) : Field(0));
    }
  }
  return hashWithPrefix(prefix, fields);
}
export function calculateAnswersCommitment(
  testAnswer: TestAnswer,
  prefix: string
): Field {
  const fields: Field[] = [Field(testAnswer.answers.length)];
  for (const answer of testAnswer.answers) {
    fields.push(Field(answer.choices.length));
    for (const choice of answer.choices) {
      fields.push(choice ? Field(1) : Field(0));
    }
  }
  return hashWithPrefix(prefix, fields);
}

export function validateAnswers(
  questions: Question[],
  prefixQuestions: string,
  testAnswer: TestAnswer,
  maxErrors: number
): boolean {
  if (questions.length !== testAnswer.answers.length) {
    return false;
  }
  const questionsCommitment = calculateQuestionsCommitment(
    questions,
    prefixQuestions
  );
  if (
    questionsCommitment.equals(testAnswer.questionsCommitment).toBoolean() ===
    false
  )
    return false;
  let errors = 0;
  for (let i = 0; i < questions.length; i++) {
    if (questions[i].type === "singleSelect") {
      if (
        testAnswer.answers[i].choices.filter((choice) => choice).length !== 1
      ) {
        return false;
      }
    }
    for (let j = 0; j < questions[i].answers.length; j++) {
      if (questions[i].rightAnswers[j] !== testAnswer.answers[i].choices[j]) {
        errors++;
      }
    }
  }
  return errors <= maxErrors;
}
