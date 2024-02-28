# Multiple Choice Questions contract and Merkle Map demo

## Multiple Choice Questions contract

### Features

- Using Action and Reducer for processing requests
- Using Merkle Map for grades storage
- Using IPFS for off-chain storage
- Using recursive proofs for being able to process many additions to Merkle Map at once, thus decreasing costs and being able to send many updates simultaneously
- Two ways for adding updates - thru actions and using bulk update
- Unlimited number of actions can be added and then processed in batches

## Installation

```
git clone https://github.com/dfstio/merkle-map-demo
cd merkle-map-demo
yarn
```

### Configuration

For test on the Berkeley that write to IPFS (only 'yarn berkeley' test), env.json file should be created using env.example.json as example.

PINATA_JWT key can be received for free on [pinata.cloud ](https://app.pinata.cloud/developers/api-keys), Developers | API Keys menu

All other tests run without env.json

## Running test on local blockchain

```
yarn test
```

Runs all tests on local blockchain.

### Test coverage

```
yarn coverage
```

Test coverage on local blockchain is 79 percent, for contracts is 97%. Details are in the jest report in the coverage folder.

```
----------------------|---------|----------|---------|---------|-----------------------------
File                  | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------------|---------|----------|---------|---------|-----------------------------
All files             |   79.05 |    51.68 |    80.7 |   78.87 |
 base                 |   78.81 |    55.55 |      80 |   78.37 |
  mapcontract.ts      |     100 |      100 |     100 |     100 |
  proof.ts            |   53.33 |    55.55 |   28.57 |   51.85 | 20,100,110-189
  update.ts           |   96.96 |      100 |    90.9 |   96.66 | 21
 lib                  |   72.43 |    46.15 |   80.43 |    72.6 |
  fast-merkle-map.ts  |   80.95 |      100 |      75 |      80 | 54-65
  fast-merkle-tree.ts |   77.55 |       50 |   81.81 |   77.77 | 37-56,65
  gc.ts               |   36.36 |       25 |     100 |      40 | 12-17
  hash.ts             |    92.5 |        0 |   89.47 |   94.59 | 22,89
  memory.ts           |    90.9 |       60 |   66.66 |      90 | 5
  storage.ts          |   29.16 |        0 |      50 |   29.16 | 26-51,56-62
 multiple-choice      |   82.66 |    53.33 |   81.57 |   82.54 |
  contract.ts         |   98.86 |      100 |    92.3 |   98.76 | 53
  map.ts              |   97.05 |      100 |    90.9 |   97.05 | 26
  proof.ts            |   53.84 |       35 |   28.57 |    52.5 | 30,65,126,138-220
  questions.ts        |    90.8 |       68 |     100 |      90 | 80,83,92,95,108,146,156,168
----------------------|---------|----------|---------|---------|-----------------------------
```

### Test results

```
merkle-map-demo % yarn jest tests/multiple-choice.test.ts
[7:36:00 PM] prepared 10 questions with 5 choices: 0.071ms
[7:36:00 PM] calculated commitment for questions: 17.44ms
[7:36:00 PM] questions commitment 26656243172593340828734353531256300432128850439394641355145139184476189625036
[7:36:00 PM] prepared answers: 0.122ms
[7:36:02 PM] methods analyzed: 2.047s
[7:36:02 PM] method's total size for a MultipleChoiceQuestionsContract with batch size 3 is 17126 rows (26% of max 65536 rows)
[7:36:02 PM] add rows: 3415
[7:36:02 PM] reduce rows: 3692
[7:36:02 PM] bulkUpdate rows: 3407
[7:36:02 PM] setOwner rows: 3312
[7:36:02 PM] setRoot rows: 3300
[7:36:03 PM] method's total size for a MultipleChoiceMapUpdate is 8225 rows (13% of max 65536 rows)
[7:36:03 PM] Compiling contracts...
[7:36:16 PM] MultipleChoiceMapUpdate compiled: 12.342s
[7:36:26 PM] MultipleChoiceQuestionsContract compiled: 10.017s
[7:36:26 PM] RSS memory should compile the SmartContract: 1757 MB
[7:36:26 PM] RSS memory should deploy the contract: 1760 MB
[7:36:26 PM] RSS memory answer 1/5 sent: 1770 MB
[7:36:39 PM] RSS memory Setting base for RSS memory: 2144 MB
[7:36:41 PM] RSS memory answer 2/5 sent: 2019 MB, changed by -125 MB
[7:36:54 PM] RSS memory answer 3/5 sent: 2059 MB, changed by -85 MB
[7:37:08 PM] RSS memory answer 4/5 sent: 2184 MB, changed by 40 MB
[7:37:21 PM] RSS memory answer 5/5 sent: 2222 MB, changed by 78 MB
[7:37:34 PM] sent answers: 1:08.755 (m:ss.mmm)
[7:37:34 PM] RSS memory should send the answers: 2253 MB, changed by 109 MB
[7:37:35 PM] length 3
[7:37:35 PM] Calculating proofs for 3 answers...
[7:37:50 PM] RSS memory Setting base for RSS memory: 2625 MB, changed by 481 MB
[7:37:50 PM] RSS memory Proof 1/3 created: 2625 MB, changed by 0 MB
[7:38:05 PM] RSS memory Proof 2/3 created: 2700 MB, changed by 75 MB
[7:38:21 PM] RSS memory Proof 3/3 created: 2801 MB, changed by 176 MB
[7:38:21 PM] Merging proofs...
[7:38:41 PM] RSS memory Setting base for RSS memory: 3463 MB, changed by 838 MB
[7:38:41 PM] RSS memory Proof 1/2 merged: 3463 MB, changed by 0 MB
[7:39:02 PM] RSS memory Proof 2/2 merged: 3602 MB, changed by 139 MB
[7:39:02 PM] Proof verification result: true
[7:39:19 PM] RSS memory should update the state: 3683 MB, changed by 220 MB
[7:39:19 PM] reduce: 1:44.646 (m:ss.mmm)
[7:39:19 PM] length 2
[7:39:19 PM] Calculating proofs for 2 answers...
[7:39:34 PM] RSS memory Setting base for RSS memory: 3696 MB, changed by 233 MB
[7:39:34 PM] RSS memory Proof 1/2 created: 3696 MB, changed by 0 MB
[7:39:49 PM] RSS memory Proof 2/2 created: 3620 MB, changed by -76 MB
[7:39:49 PM] Merging proofs...
[7:40:09 PM] RSS memory Setting base for RSS memory: 3854 MB, changed by 158 MB
[7:40:09 PM] RSS memory Proof 1/1 merged: 3854 MB, changed by 0 MB
[7:40:10 PM] Proof verification result: true
[7:40:27 PM] RSS memory should update the state: 3797 MB, changed by -57 MB
[7:40:27 PM] reduce: 1:08.004 (m:ss.mmm)
[7:40:27 PM] Calculating proofs for 5 answers...
[7:40:42 PM] RSS memory Setting base for RSS memory: 3853 MB, changed by -1 MB
[7:40:42 PM] RSS memory Proof 1/5 created: 3853 MB, changed by 0 MB
[7:40:57 PM] RSS memory Proof 2/5 created: 3821 MB, changed by -32 MB
[7:41:11 PM] RSS memory Proof 3/5 created: 3874 MB, changed by 21 MB
[7:41:25 PM] RSS memory Proof 4/5 created: 3951 MB, changed by 98 MB
[7:41:40 PM] RSS memory Proof 5/5 created: 3911 MB, changed by 58 MB
[7:41:40 PM] Merging proofs...
[7:41:58 PM] RSS memory Setting base for RSS memory: 4163 MB, changed by 310 MB
[7:41:58 PM] RSS memory Proof 1/4 merged: 4163 MB, changed by 0 MB
[7:42:16 PM] RSS memory Proof 2/4 merged: 4144 MB, changed by -19 MB
[7:42:34 PM] RSS memory Proof 3/4 merged: 4161 MB, changed by -2 MB
[7:42:52 PM] RSS memory Proof 4/4 merged: 4211 MB, changed by 48 MB
[7:42:52 PM] Proof verification result: true
[7:43:09 PM] RSS memory should bulk update the state: 4026 MB, changed by -137 MB
[7:43:09 PM] bulk update: 2:41.540 (m:ss.mmm)
 PASS  tests/multiple-choice.test.ts
  Multiple Choice Questions Contract
    ✓ should generate questions (10 ms)
    ✓ should validate questions
    ✓ should calculate commitment for questions (18 ms)
    ✓ should create users (1 ms)
    ✓ should generate valid answers (309 ms)
    ✓ should compile contract (25543 ms)
    ✓ should deploy the contract (189 ms)
    ✓ should send the actions with answers (68756 ms)
    ✓ should check the actions (23 ms)
    ✓ should update the state using actions (172668 ms)
    ✓ should update the state using bulk update (161548 ms)

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
Snapshots:   0 total
Time:        430.238 s, estimated 500 s

```

## Running test on the Berkeley

Contract address: [B62qjZkP52mUXR3sh8ny2CsMpS5oqHqJGHeqrfGmfRdyGMMKGWaqMCQ](https://minascan.io/berkeley/account/B62qjZkP52mUXR3sh8ny2CsMpS5oqHqJGHeqrfGmfRdyGMMKGWaqMCQ/txs?type=zk-acc)

To read Merkle Map from off-chain IPFS storage and verify the Merkle Map using on-chain values

```
yarn read
```

### Test results

```
merkle-map-demo % yarn read
[7:39:37 PM] Loading data from IPFS: QmVceXmvrwpsoeGy8E2f3jpSRd7NzFETYwYB96iL9YWkf3
[7:39:39 PM] Loaded grades: [
  {
    address: 'B62qjwjReb4FXSAX7GntEFaFWxYmRMkvmJBFUCrv9tVuX2m8jwVrwjA',
    grade: '1'
  },
  {
    address: 'B62qrpzrR9utV68Z2AjVTpMep3eka46fm3cMKyq2gKvwGAP4v32utsX',
    grade: '1'
  },
...
  {
    address: 'B62qkNVqUoCNZqTbLnmHw85HSUjb2iiEJBFJ3Aimff8FSCTf2gq1ZvG',
    grade: '1'
  }
]
 PASS  tests/berkeley/read.test.ts
  Read the database of the Multiple Choice Questions Contract
    ✓ should load database (32265 ms)
    ✓ should verify database (642 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        34.329 s
Ran all test suites matching /tests\/berkeley\/read.test.ts/i.

```

To update Merkle Map in off-chain storage and on-chain by adding several new entries to the Merkle Map:

```
yarn berkeley
```

### Test results

```
merkle-map-demo % yarn berkeley
[7:05:03 PM] Loading questions...
[7:05:03 PM] prepared answers: 0.072ms
[7:05:03 PM] Loading data from IPFS: QmaV3VHgZp4zSqnQMQqi6w6q1PX3ThG3DvmBi59iNXT4VM
[7:05:05 PM] Compiling contracts...
[7:05:17 PM] MultipleChoiceMapUpdate compiled: 12.391s
[7:05:29 PM] MultipleChoiceQuestionsContract compiled: 11.991s
[7:05:29 PM] RSS memory should compile the SmartContract: 1854 MB
[7:05:30 PM] balance 297.4
[7:05:30 PM] initial count: 7
[7:05:30 PM] initial root: 17556269742838667619951376122201726180399495061000689681104498102188910383431
[7:05:30 PM] Calculating proofs for 3 answers...
[7:05:46 PM] RSS memory Setting base for RSS memory: 2264 MB
[7:05:46 PM] RSS memory Proof 1/3 created: 2264 MB, changed by 0 MB
[7:06:01 PM] RSS memory Proof 2/3 created: 2274 MB, changed by 10 MB
[7:06:17 PM] RSS memory Proof 3/3 created: 2307 MB, changed by 43 MB
[7:06:17 PM] Merging proofs...
[7:06:37 PM] RSS memory Setting base for RSS memory: 3115 MB, changed by 851 MB
[7:06:37 PM] RSS memory Proof 1/2 merged: 3115 MB, changed by 0 MB
[7:06:57 PM] RSS memory Proof 2/2 merged: 3351 MB, changed by 236 MB
[7:06:57 PM] Proof verification result: true
[7:06:59 PM] saveToIPFS result: {
  IpfsHash: 'QmVceXmvrwpsoeGy8E2f3jpSRd7NzFETYwYB96iL9YWkf3',
  PinSize: 1103,
  Timestamp: '2024-02-28T15:06:59.021Z'
}
[7:07:16 PM] tx sent: 5JuCsuP2jy6pc7DxNqww4Kh6T5iXs4D9s7JMB2WCs7BrfkUvQP36
[7:07:16 PM] RSS memory should bulk update the state: 3285 MB, changed by 170 MB
[7:07:16 PM] bulk update: 1:46.759 (m:ss.mmm)
[7:07:16 PM] Waiting for bulk update tx to be included into block...
[7:20:23 PM] bulk update tx included into block: 5JuCsuP2jy6pc7DxNqww4Kh6T5iXs4D9s7JMB2WCs7BrfkUvQP36
[7:20:23 PM] bulk update tx included into block: 13:06.737 (m:ss.mmm)
[7:20:44 PM] final count: 10
[7:20:44 PM] final root: 13453709937069470822637159979556853056051297901028609999020137905874897517686
 PASS  tests/berkeley/multiple-choice.test.ts
  Multiple Choice Questions Contract
    ✓ should load questions (33 ms)
    ✓ should validate questions
    ✓ should create users
    ✓ should generate valid answers (94 ms)
    ✓ should load database (1366 ms)
    ✓ should verify database (407 ms)
    ✓ should compile contracts (24384 ms)
    ✓ should update the state using bulk update (914673 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        942.285 s
Ran all test suites matching /tests\/berkeley\/multiple-choice.test.ts/i.
```

Note: receiving errors during tests on Berkeley is normal, the tests are able to recover automatically from Berkeley node errors. See src/lib/fetch.ts for details.

The tests on the tests/issues folder should not pass, they illustrate the issues raised on o1js github (the list of issues is below).

The tests in the tests/api folder are designed to load testing sending txs using zkCloudWorker and should be run manually taking into account limitations described in the issues and instructions in the test comments.
The zkCloudWorker part can be seen at

https://github.com/dfstio/minanft-api/blob/master/zkcloudworker.ts#L119

https://github.com/dfstio/minanft-api/blob/master/src/external/NameService/plugin.ts

Example of the transaction sent using zkCloudWorker that calculates recursive proof for 128 actions and then reduces 128 actions:

https://minascan.io/berkeley/tx/5JuQ2hzqBMJGc2BcMNAxPgX3VaSLNGJctMzELJhViPcjdXJSTSkS?type=zk-tx

## References

### Actions and Reducer

- Documentation

https://docs.minaprotocol.com/zkapps/o1js/actions-and-reducer

- Examples

https://github.com/o1-labs/o1js/tree/main/src/examples/zkapps/reducer

- Discussion

https://discord.com/channels/484437221055922177/1200733563297988638

https://discord.com/channels/484437221055922177/1207346352359739452

- Issues

https://github.com/o1-labs/o1js/issues/1426

https://github.com/o1-labs/o1js/issues/1427

https://github.com/o1-labs/o1js/issues/1463
