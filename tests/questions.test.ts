import { describe, expect, it } from "@jest/globals";
import { Field } from "o1js";
import {
  Question,
  generateAnswers,
  generateQuestions,
  MultipleChoiceAnswer,
  MultipleChoiceQuestionType,
  calculateAnswersCommitment,
  calculateQuestionsCommitment,
  validateQuestions,
  validateAnswers,
  TestAnswer,
} from "../src/multiple-choice/questions";

const QUESTIONS_NUMBER = 10;
const CHOICES_NUMBER = 5;
const prefixQuestions = "questions";
const prefixAnswers = "answers";
let questions: Question[] = [];
let answers: TestAnswer = { answers: [] };

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

  it(`should generate valid answers`, async () => {
    console.time(`prepared answers`);
    answers = await generateAnswers(questions, true);
    console.timeEnd(`prepared answers`);
    expect(answers).toBeDefined();
    expect(answers.answers.length).toBe(QUESTIONS_NUMBER);
    const checkAnswer = validateAnswers(questions, answers, 0);
    expect(checkAnswer).toBe(true);
  });

  it(`should generate invalid answers`, async () => {
    console.time(`prepared invalid answers`);
    const invalidAnswers = await generateAnswers(questions, false);
    console.timeEnd(`prepared invalid answers`);
    expect(invalidAnswers).toBeDefined();
    expect(invalidAnswers.answers.length).toBe(QUESTIONS_NUMBER);
    const checkAnswer = validateAnswers(questions, invalidAnswers, 0);
    expect(checkAnswer).toBe(false);
  });

  it(`should calculate commitment for questions`, async () => {
    console.time(`calculated commitment for questions`);
    const commitment = calculateQuestionsCommitment(questions, prefixQuestions);
    console.timeEnd(`calculated commitment for questions`);
    console.log(`questions commitment`, commitment.toJSON());
    expect(commitment).toBeDefined();
    expect(commitment).toBeInstanceOf(Field);
  });

  it(`should calculate commitment for answers`, async () => {
    console.time(`calculated commitment for answers`);
    const commitment = calculateAnswersCommitment(answers, prefixAnswers);
    console.timeEnd(`calculated commitment for answers`);
    console.log(`answers commitment`, commitment.toJSON());
    expect(commitment).toBeDefined();
    expect(commitment).toBeInstanceOf(Field);
  });
});
