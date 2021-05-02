module.exports = {
  GENESIS_BLOCK: {
    index: 0,
    previousHash: '0',
    timestamp: 1620884498690,
    transactions: [
      {
        id: '63ec3ac02f822450039df13ddf7c3c0f19bab4acd4dc928c62fcd78d5ebc6dba',
        hash: null,
        type: 'regular',
        data: {
          inputs: [],
          outputs: []
        }
      }
    ],
    nonce: 0
  },

  FEE_PER_TRANSACTION: 1,

  MINING_REWARD: 5000000000,

  pow: {
    getDifficulty: (blocks, index) => {
      // POW difficulty settings
      const BASE_DIFFICULTY = Number.MAX_SAFE_INTEGER;
      const EVERY_X_BLOCKS = 5;
      const POW_CURVE = 5;

      return Math.max(Math.floor(BASE_DIFFICULTY / Math.pow(Math.floor(((index || blocks.length) + 1) / EVERY_X_BLOCKS) + 1, POW_CURVE)), 0);
    }
  }
}
