import { PrivateKey } from "o1js";

interface ContractConfig {
  contractPrivateKey: PrivateKey;
  contractAddress: string;
  ownerPrivateKey: PrivateKey;
}

export const multipleChoiceQuestionsContract: ContractConfig = {
  contractPrivateKey: PrivateKey.fromBase58(
    "EKF9pZjrFNuEXDZyVQEFwL4WBdtRcEZMz37cxGf242QAvwSS4q5v"
  ),
  contractAddress: "B62qjGHgtjgz5Ka4Z8LfbbZnVi6TCKZ561cNMDfe6Ly9jHvfR5DaMCQ",
  ownerPrivateKey: PrivateKey.fromBase58(
    "EKEBt4ekTQEZQS1tdVDBEUAk1MXvBwBUDchZD4ZnpF3evuNsQv7N"
  ),
};

export const baseContract: ContractConfig = {
  contractPrivateKey: PrivateKey.fromBase58(
    "EKEpSiV7GCqidsaXsnhUFEE1qHYLsNvpPqx6fWXfAPDrdPoNrE7f"
  ),
  contractAddress: "B62qmWinDr5Z6mNTLhrmYJaVpT5VkAvzPj2yNMpgvZW2tG7ecVcNAME",
  ownerPrivateKey: PrivateKey.fromBase58(
    "EKFRg9MugtXvFPe4N6Au28kQyYx9txt4CVPgBPRYdv4wvbKBJpEy"
  ),
};

export const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0NTkwMzQ5NDYiLCJpYXQiOjE3MDEzNTY5NzEsImV4cCI6MTczMjg5Mjk3MX0.r94tKntDvLpPJT2zzEe7HMUcOAQYQu3zWNuyFFiChD0";

export const deployer = PrivateKey.fromBase58(
  "EKEM8aqm9HNJjnpPjgZELpDR8XnPAD3qX2sQEnZEV1JoYKdhBkFY"
);

/* Base
export const ownerPrivateKey = PrivateKey.fromBase58(
  "EKFRg9MugtXvFPe4N6Au28kQyYx9txt4CVPgBPRYdv4wvbKBJpEy"
); // owner of the contract

export const contractPrivateKey = PrivateKey.fromBase58(
  "EKEpSiV7GCqidsaXsnhUFEE1qHYLsNvpPqx6fWXfAPDrdPoNrE7f"
);
export const contractAddress =
  "B62qmWinDr5Z6mNTLhrmYJaVpT5VkAvzPj2yNMpgvZW2tG7ecVcNAME";
*/

/* Old base
export const contractPrivateKey = PrivateKey.fromBase58(
  "EKEexFXfLfyY2i8v3CiBC56meVtjbCac7wMS6z6ez7NJDtTQJ7Lr"
);
export const contractAddress =
  "B62qjirMYUSyjb1AcyNmAF5dLqTk3KQuoUYKv5FGdx618GDmRfYNAME";
*/
