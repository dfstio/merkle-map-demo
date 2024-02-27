interface Question {
  question: string;
  answer: string;
  options: string[];
}

class FullAnswer {
  answer: string;
}

export async function generateQuestions() {
  const questions: any[] = [];

  return questions;
}

export async function generateAnswers() {
  const answers: any[] = [];

  return answers;
}

export async function validateQuestions(questions: any[]) {
  return true;
}

export async function validateAnswers(answers: any[]) {
  return true;
}
