const R = require('ramda');
const Block = require('./block');
const Blocks = require('./blocks');
const Database = require('../Database/database');
const config = require('../config');
const BlockException = require('../error/BlockException');
const Transactions = require('./transactions');
const TransactionException = require('../error/TransactionException');

const BC_FILE = 'blocks.json';
const TRANSACTIONS_FILE = 'transactions.json';
const defaultDBName = '1';

class Blockchain {
  constructor(dbPath) {
    dbPath = dbPath || defaultDBName;
    this.blocksDB = new Database('data/' + dbPath + '/' + BC_FILE, new Blocks());
    this.transactionsDB = new Database('data/' + dbPath + '/' + TRANSACTIONS_FILE, new Transactions());

    this.blocks = this.blocksDB.read(Blocks);
    this.transactions = this.transactionsDB.read(Transactions);

    this.init();
  }

  // init blockchain
  init() {
    console.log(this.blocks.length);
    if (this.blocks.length == 0) {
      console.log('Blockchain empty, adding genesis block');
      this.blocks.push(Block.genesis);
      this.blocksDB.write(this.blocks);
    }

    // Remove transactions that are in the blockchain
    console.info('Removing transactions that are in the blockchain');
    R.forEach(this.removeBlockTransactionsFromTransactions.bind(this), this.blocks);
  }

  getAllBlocks() {
    return this.blocks;
  }

  getBlockByIndex(index) {
    return this.blocks.find(x => x.index === index);
  }

  getLastBlock() {
    return R.last(this.blocks);
  }

  getBlockByHash(hash) {
    return this.blocks.find(x => x.hash === hash);
  }

  addBlock(newBlock) {
    if (this.checkBlock(newBlock, this.getLastBlock())) {
      this.blocks.push(newBlock);
      this.blocksDB.write(this.blocks);

      return newBlock;
    }
  }

  checkBlock(newBlock, previousBlock) {
    const blockHash = newBlock.toHash();

    /**
     * Check block is the last block
     * Check previous block is correct
     * Check hash is correct
     */
    if (previousBlock.index + 1 !== newBlock.index) {
      console.log(`Invalid index: expected '${previousBlock.index + 1}', but got '${newBlock.index}'`);
      throw new BlockException(`Invalid index: expected '${previousBlock.index + 1}' got '${newBlock.index}'`)
    } else if (previousBlock.hash !== newBlock.previousHash) {
      console.log(`Invalid previoushash: expected '${previousBlock.hash}' got '${newBlock.previousHash}'`);
      throw new BlockException(`Invalid previoushash: expected '${previousBlock.hash}' got '${newBlock.previousHash}'`);
    } else if (blockHash !== newBlock.hash) {
      console.log(`Invalid hash: expected '${blockHash}' got '${newBlock.hash}'`);
      throw new BlockException(`Invalid hash: expected '${blockHash}' got '${newBlock.hash}'`);
    } else if (newBlock.getDifficulty() >= this.getDifficulty(newBlock.index)) { // If the difficulty level of the proof-of-work challenge is correct
      console.error(`Invalid proof-of-work difficulty: expected '${newBlock.getDifficulty()}' to be smaller than '${this.getDifficulty(newBlock.index)}'`);
      throw new BlockException(`Invalid proof-of-work difficulty: expected '${newBlock.getDifficulty()}' be smaller than '${this.getDifficulty()}'`);
    }

    // check transaction is valid per block
    R.forEach(this.checkTransaction.bind(this), newBlock.transactions, referenceBlockchain);
    // Check if the sum of output transactions are equal the sum of input transactions + MINING_REWARD (representing the reward for the block miner)
    let sumOfInputsAmount = R.sum(R.flatten(R.map(R.compose(R.map(R.prop('amount')), R.prop('inputs'), R.prop('data')), newBlock.transactions))) + config.MINING_REWARD;
    let sumOfOutputsAmount = R.sum(R.flatten(R.map(R.compose(R.map(R.prop('amount')), R.prop('outputs'), R.prop('data')), newBlock.transactions)));

    let isInputsAmountGreaterOrEqualThanOutputsAmount = R.gte(sumOfInputsAmount, sumOfOutputsAmount);
    if (!isInputsAmountGreaterOrEqualThanOutputsAmount) {
      console.log(`Invalid block balance: inputs sum '${sumOfInputsAmount}', outputs sum '${sumOfOutputsAmount}'`);
      throw new BlockException(`Invalid block balance: inputs sum '${sumOfInputsAmount}', outputs sum '${sumOfOutputsAmount}'`, { sumOfInputsAmount, sumOfOutputsAmount });
    }

    // Check if there is double spending
    let listOfTransactionIndexInputs = R.flatten(R.map(R.compose(R.map(R.compose(R.join('|'), R.props(['transaction', 'index']))), R.prop('inputs'), R.prop('data')), newBlock.transactions));
    let doubleSpendingList = R.filter((x) => x >= 2, R.map(R.length, R.groupBy(x => x)(listOfTransactionIndexInputs)));

    if (R.keys(doubleSpendingList).length) {
      console.log(`There are unspent output transactions being used more than once: unspent output transaction: '${R.keys(doubleSpendingList).join(', ')}'`);
      throw new BlockException(`There are unspent output transactions being used more than once: unspent output transaction: '${R.keys(doubleSpendingList).join(', ')}'`);
    }

    // Check if there is only 1 fee transaction and 1 reward transaction;
    let transactionsByType = R.countBy(R.prop('type'), newBlock.transactions);
    if (transactionsByType.fee && transactionsByType.fee > 1) {
      console.log(`Invalid fee transaction count: expected '1' got '${transactionsByType.fee}'`);
      throw new BlockException(`Invalid fee transaction count: expected '1' got '${transactionsByType.fee}'`);
    }

    if (transactionsByType.reward && transactionsByType.reward > 1) {
      console.log(`Invalid reward transaction count: expected '1' got '${transactionsByType.reward}'`);
      throw new BlockException(`Invalid reward transaction count: expected '1' got '${transactionsByType.reward}'`);
    }

    return true;
  }

  removeBlockTransactionsFromTransactions(newBlock) {
    this.transactions = R.reject((transaction) => { return R.find(R.propEq('id', transaction.id), newBlock.transactions); }, this.transactions);
    this.transactionsDB.write(this.transactions);
  }

  checkTransaction(transaction, referenceBlockchain = this.blocks) {

    transaction.check(transaction);

    // Verify if the transaction isn't already in the blockchain
    let isNotInBlockchain = R.all((block) => {
      return R.none(R.propEq('id', transaction.id), block.transactions);
    }, referenceBlockchain);

    if (!isNotInBlockchain) {
      console.log(`Transaction '${transaction.id}' is already in the blockchain`);
      throw new TransactionException(`Transaction '${transaction.id}' is already in the blockchain`, transaction);
    }

    // Verify if all input transactions are unspent in the blockchain
    let isInputTransactionsUnspent = R.all(R.equals(false), R.flatten(R.map((txInput) => {
      return R.map(
        R.pipe(
          R.prop('transactions'),
          R.map(R.pipe(
            R.path(['data', 'inputs']),
            R.contains({ transaction: txInput.transaction, index: txInput.index })
          ))
        ), referenceBlockchain);
    }, transaction.data.inputs)));

    if (!isInputTransactionsUnspent) {
      console.log(`Not all inputs are unspent for transaction '${transaction.id}'`);
      throw new TransactionException(`Not all inputs are unspent for transaction '${transaction.id}'`, transaction.data.inputs);
    }

    return true;
  }

  getDifficulty(index) {
    // Calculates the difficulty based on the index since the difficulty value increases every X blocks.
    return config.pow.getDifficulty(this.blocks, index);
  }

  addTransaction(newTransaction, emit = true) {
    // It only adds the transaction if it's valid
    if (this.checkTransaction(newTransaction, this.blocks)) {
      this.transactions.push(newTransaction);
      this.transactionsDB.write(this.transactions);

      console.info(`Transaction added: ${newTransaction.id}`);
      console.debug(`Transaction added: ${JSON.stringify(newTransaction)}`);
      if (emit) this.emitter.emit('transactionAdded', newTransaction);

      return newTransaction;
    }
  }

  removeBlockTransactionsFromTransactions(newBlock) {
    this.transactions = R.reject((transaction) => { return R.find(R.propEq('id', transaction.id), newBlock.transactions); }, this.transactions);
    this.transactionsDB.write(this.transactions);
  }

  replaceChain(newBlockchain) {
    // It doesn't make sense to replace this blockchain by a smaller one
    if (newBlockchain.length <= this.blocks.length) {
      console.error('Blockchain shorter than the current blockchain');
      throw new BlockException('Blockchain shorter than the current blockchain');
    }

    // Verify if the new blockchain is correct
    this.checkChain(newBlockchain);

    // Get the blocks that diverges from our blockchain
    console.info('Received blockchain is valid. Replacing current blockchain with received blockchain');
    let newBlocks = R.takeLast(newBlockchain.length - this.blocks.length, newBlockchain);

    // Add each new block to the blockchain
    R.forEach((block) => {
      this.addBlock(block, false);
    }, newBlocks);

    this.emitter.emit('blockchainReplaced', newBlocks);
  }

  checkChain(blockchainToValidate) {
    // Check if the genesis block is the same
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(Block.genesis)) {
      console.error('Genesis blocks aren\'t the same');
      throw new BlockException('Genesis blocks aren\'t the same');
    }

    /**
     * Compare every block to the previous one
     * skip first block
     */
    try {
      for (let i = 1; i < blockchainToValidate.length; i++) {
        this.checkBlock(blockchainToValidate[i], blockchainToValidate[i - 1], blockchainToValidate);
      }
    } catch (ex) {
      console.error('Invalid block sequence');
      throw new BlockException('Invalid block sequence', null, ex);
    }
    return true;
  }

  getUnspentTransactionsForAddress(address) {
    const selectTxs = (transaction) => {
      let index = 0;
      // Create a list of all transactions outputs found for an address (or all).
      R.forEach((txOutput) => {
        if (address && txOutput.address == address) {
          txOutputs.push({
            transaction: transaction.id,
            index: index,
            amount: txOutput.amount,
            address: txOutput.address
          });
        }
        index++;
      }, transaction.data.outputs);

      // Create a list of all transactions inputs found for an address (or all).            
      R.forEach((txInput) => {
        if (address && txInput.address != address) return;

        txInputs.push({
          transaction: txInput.transaction,
          index: txInput.index,
          amount: txInput.amount,
          address: txInput.address
        });
      }, transaction.data.inputs);
    };

    // Considers both transactions in block and unconfirmed transactions (enabling transaction chain)
    let txOutputs = [];
    let txInputs = [];
    R.forEach(R.pipe(R.prop('transactions'), R.forEach(selectTxs)), this.blocks);
    R.forEach(selectTxs, this.transactions);

    // Cross both lists and find transactions outputs without a corresponding transaction input
    let unspentTransactionOutput = [];
    R.forEach((txOutput) => {
      if (!R.any((txInput) => txInput.transaction == txOutput.transaction && txInput.index == txOutput.index, txInputs)) {
        unspentTransactionOutput.push(txOutput);
      }
    }, txOutputs);

    return unspentTransactionOutput;
  }
}

module.exports = Blockchain;