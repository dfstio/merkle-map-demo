import { describe, expect, it } from "@jest/globals";
import { Field } from "o1js";
import {
  Question,
  generateAnswers,
  generateQuestions,
  calculateAnswersCommitment,
  calculateQuestionsCommitment,
  validateQuestions,
  validateAnswers,
  TestAnswer,
} from "../src/multiple-choice/questions";

const QUESTIONS_NUMBER = 10;
const CHOICES_NUMBER = 5;
const USERS_COUNT = 7;
const prefixQuestions = "questions";
const prefixAnswers = "answers";
let questions: Question[] = [];
let answers: TestAnswer[] = [];
let questionsCommitment: Field | undefined = undefined;

describe("Questions", () => {
  it(`should generate questions`, async () => {
    console.time(
      `prepared ${QUESTIONS_NUMBER} questions with ${CHOICES_NUMBER} choices`
    );
    questions = await generateQuestions(QUESTIONS_NUMBER, CHOICES_NUMBER);
    console.timeEnd(
      `prepared ${QUESTIONS_NUMBER} questions with ${CHOICES_NUMBER} choices`
    );
  });

  it(`should validate questions`, async () => {
    const checkQuestions = validateQuestions(questions);
    expect(checkQuestions).toBe(true);
  });

  it(`should calculate commitment for questions`, async () => {
    console.time(`calculated commitment for questions`);
    const commitment = calculateQuestionsCommitment(questions, prefixQuestions);
    console.timeEnd(`calculated commitment for questions`);
    console.log(`questions commitment`, commitment.toJSON());
    expect(commitment).toBeDefined();
    expect(commitment).toBeInstanceOf(Field);
    questionsCommitment = commitment;
  });

  it(`should generate valid answers`, async () => {
    expect(questionsCommitment).toBeDefined();
    if (questionsCommitment === undefined) return;
    console.time(`prepared answers`);
    answers = generateAnswers(
      questions,
      questionsCommitment,
      USERS_COUNT,
      true
    );
    console.timeEnd(`prepared answers`);
    expect(answers).toBeDefined();
    for (const answer of answers) {
      const checkAnswer = validateAnswers(
        questions,
        prefixQuestions,
        answer,
        0
      );
      expect(checkAnswer).toBe(true);
    }
  });

  it(`should generate invalid answers`, async () => {
    expect(questionsCommitment).toBeDefined();
    if (questionsCommitment === undefined) return;
    console.time(`prepared invalid answers`);
    const invalidAnswers = generateAnswers(
      questions,
      questionsCommitment,
      USERS_COUNT,
      false
    );
    console.timeEnd(`prepared invalid answers`);
    expect(invalidAnswers).toBeDefined();
    for (const answer of invalidAnswers) {
      const checkAnswer = validateAnswers(
        questions,
        prefixQuestions,
        answer,
        0
      );
      expect(checkAnswer).toBe(false);
    }
  });

  it(`should calculate commitment for answers`, async () => {
    console.time(`calculated commitment for answers`);
    for (const answer of answers) {
      const commitment = calculateAnswersCommitment(answer, prefixAnswers);
      expect(commitment).toBeDefined();
      expect(commitment).toBeInstanceOf(Field);
    }
    console.timeEnd(`calculated commitment for answers`);
  });
});
