import { Field, MerkleMap, Poseidon, verify, VerificationKey } from "o1js";
import { Answer, AnswerData } from "./contract";
import {
  MultipleChoiceMapTransition,
  MultipleChoiceMapUpdate,
  MultipleChoiceMapUpdateData,
  MultipleChoiceMapUpdateProof,
} from "./map";
import { Question, validateAnswers, TestAnswer, FullAnswer } from "./questions";

import { collect } from "../lib/gc";
import { Memory } from "../lib/memory";

export async function calculateProof(
  answers: FullAnswer[],
  questions: Question[],
  questionsPrefix: string,
  map: MerkleMap,
  verificationKey: VerificationKey | undefined,
  verbose: boolean = false
): Promise<MultipleChoiceMapUpdateProof> {
  console.log(`Calculating proofs for ${answers.length} answers...`);
  if (verificationKey === undefined)
    throw new Error("Verification key is not defined");

  interface AnswerState {
    isAnswerAccepted: boolean;
    update?: MultipleChoiceMapUpdateData;
    oldRoot: Field;
  }

  function isAccepted(answer: TestAnswer): boolean {
    return validateAnswers(questions, questionsPrefix, answer, 0);
  }

  let updates: AnswerState[] = [];

  for (let i = 0; i < answers.length; i++) {
    const oldRoot = map.getRoot();
    const key = Poseidon.hash([...answers[i].data.address.toFields()]);
    if (isAccepted(answers[i].answer)) {
      map.set(key, Field(1));
      const newRoot = map.getRoot();
      const update = new MultipleChoiceMapUpdateData({
        oldRoot,
        newRoot,
        key,
        oldValue: Field(0),
        newValue: Field(1),
        witness: map.getWitness(key),
      });
      updates.push({ isAnswerAccepted: true, update, oldRoot });
    } else {
      updates.push({ isAnswerAccepted: false, oldRoot });
    }
  }

  let proofs: MultipleChoiceMapUpdateProof[] = [];
  for (let i = 0; i < answers.length; i++) {
    const state = updates[i].isAnswerAccepted
      ? MultipleChoiceMapTransition.accept(
          updates[i].update!,
          answers[i].data.address,
          answers[i].data.commitment,
          Field(1)
        )
      : MultipleChoiceMapTransition.reject(
          updates[i].oldRoot,
          answers[i].data.address,
          answers[i].data.commitment
        );

    await collect();
    const proof = updates[i].isAnswerAccepted
      ? await MultipleChoiceMapUpdate.accept(
          state,
          updates[i].update!,
          answers[i].data.address,
          answers[i].data.commitment,
          Field(1)
        )
      : await MultipleChoiceMapUpdate.reject(
          state,
          updates[i].oldRoot,
          answers[i].data.address,
          answers[i].data.commitment
        );
    if (i === 0) Memory.info(`Setting base for RSS memory`, false, true);
    proofs.push(proof);
    if (verbose) Memory.info(`Proof ${i + 1}/${answers.length} created`);
  }

  console.log("Merging proofs...");
  let proof: MultipleChoiceMapUpdateProof = proofs[0];
  for (let i = 1; i < proofs.length; i++) {
    const state = MultipleChoiceMapTransition.merge(
      proof.publicInput,
      proofs[i].publicInput
    );
    await collect();
    let mergedProof: MultipleChoiceMapUpdateProof =
      await MultipleChoiceMapUpdate.merge(state, proof, proofs[i]);
    if (i === 1) Memory.info(`Setting base for RSS memory`, false, true);
    proof = mergedProof;
    if (verbose) Memory.info(`Proof ${i}/${proofs.length - 1} merged`);
  }

  const verificationResult: boolean = await verify(
    proof.toJSON(),
    verificationKey
  );

  console.log("Proof verification result:", verificationResult);
  if (verificationResult === false) {
    throw new Error("Proof verification error");
  }

  return proof;
}

export async function prepareProofData(
  answers: FullAnswer[],
  questions: Question[],
  questionsPrefix: string,
  map: MerkleMap
): Promise<{ state: Field[]; transactions: string[] }> {
  console.log(`Preparing proofs data for ${answers.length} answers...`);
  const transactions: string[] = [];

  interface AnswerState {
    isAnswerAccepted: boolean;
    update?: MultipleChoiceMapUpdateData;
    oldRoot: Field;
  }

  function isAccepted(answer: TestAnswer): boolean {
    return validateAnswers(questions, questionsPrefix, answer, 0);
  }

  let updates: AnswerState[] = [];

  for (let i = 0; i < answers.length; i++) {
    const oldRoot = map.getRoot();
    const key = Poseidon.hash([...answers[i].data.address.toFields()]);
    if (isAccepted(answers[i].answer)) {
      map.set(key, Field(1));
      const newRoot = map.getRoot();
      const update = new MultipleChoiceMapUpdateData({
        oldRoot,
        newRoot,
        key,
        oldValue: Field(0),
        newValue: Field(1),
        witness: map.getWitness(key),
      });
      updates.push({ isAnswerAccepted: true, update, oldRoot });
    } else {
      updates.push({ isAnswerAccepted: false, oldRoot });
    }
  }

  let states: MultipleChoiceMapTransition[] = [];
  for (let i = 0; i < answers.length; i++) {
    console.log(`Calculating state ${i}/${answers.length}...`);
    if (updates[i].isAnswerAccepted) {
      const update = updates[i].update;
      if (update === undefined) throw new Error("Update is undefined");
      const state = MultipleChoiceMapTransition.accept(
        update,
        answers[i].data.address,
        answers[i].data.commitment,
        Field(1)
      );
      states.push(state);
      const tx = {
        isAccepted: true,
        state: state.toFields().map((f) => f.toJSON()),
        address: answers[i].data.address.toBase58(),
        update: update.toFields().map((f) => f.toJSON()),
      };
      transactions.push(JSON.stringify(tx, null, 2));
    } else {
      const state = MultipleChoiceMapTransition.reject(
        updates[i].oldRoot,
        answers[i].data.address,
        answers[i].data.commitment
      );
      const tx = {
        isAccepted: false,
        state: state.toFields().map((f) => f.toJSON()),
        address: answers[i].data.address.toBase58(),
        commitment: answers[i].data.commitment.toJSON(),
        root: updates[i].oldRoot.toJSON(),
        grade: updates[i].isAnswerAccepted
          ? Field(1).toJSON()
          : Field(0).toJSON(),
      };
      transactions.push(JSON.stringify(tx, null, 2));
      states.push(state);
    }
  }

  let state: MultipleChoiceMapTransition = states[0];
  for (let i = 1; i < states.length; i++) {
    const newState = MultipleChoiceMapTransition.merge(state, states[i]);
    state = newState;
  }

  return { state: state.toFields(), transactions };
}
