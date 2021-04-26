const R = require('ramda');
const { hash } = require('../util/crytoUtil');
const CryptoEdDSAUtil = require('../util/cryptoEdDSAUtil');
const TransactionException = require('../error/TransactionException');
const config = require('../config');

class Transaction {
  construct() {
    this.id = null;
    this.hash = null;
    this.type = null;
    this.data = {
      inputs: [],
      outputs: []
    };
  }

  toHash() {
    return hash(this.id + this.type + JSON.stringify(this.data));
  }

  check() {
    let isTransactionHashValid = this.hash == this.toHash();

    if (!isTransactionHashValid) {
      console.log(`Invalid transaction hash '${this.hash}'`);
      throw new TransactionException(`Invalid transaction hash '${this.hash}'`, this);
    }

    R.map((txInput) => {
      let txInputHash = hash({
        transaction: txInput.transaction,
        index: txInput.index,
        address: txInput.address
      });
      let isValidSignature = CryptoEdDSAUtil.verifySignature(txInput.address, txInput.signature, txInputHash);

      if (!isValidSignature) {
        console.log(`Invalid transaction input signature '${JSON.stringify(txInput)}'`);
        throw new TransactionException(`Invalid transaction input signature '${JSON.stringify(txInput)}'`, txInput);
      }
    }, this.data.inputs);


    if (this.type == 'regular') {
      let sumOfInputsAmount = R.sum(R.map(R.prop('amount'), this.data.inputs));
      let sumOfOutputsAmount = R.sum(R.map(R.prop('amount'), this.data.outputs));

      let negativeOutputsFound = 0;
      let i = 0;
      let outputsLen = this.data.outputs.length;

      // Check for negative outputs
      for (i = 0; i < outputsLen; i++) {
        if (this.data.outputs[i].amount < 0) {
          negativeOutputsFound++;
        }
      }

      let isInputsAmountGreaterOrEqualThanOutputsAmount = R.gte(sumOfInputsAmount, sumOfOutputsAmount);

      if (!isInputsAmountGreaterOrEqualThanOutputsAmount) {
        console.log(`Invalid transaction balance: inputs sum '${sumOfInputsAmount}', outputs sum '${sumOfOutputsAmount}'`);
        throw new TransactionException(`Invalid transaction balance: inputs sum '${sumOfInputsAmount}', outputs sum '${sumOfOutputsAmount}'`, { sumOfInputsAmount, sumOfOutputsAmount });
      }

      let isEnoughFee = (sumOfInputsAmount - sumOfOutputsAmount) >= config.FEE_PER_TRANSACTION; // 1 because the fee is 1 satoshi per transaction

      if (!isEnoughFee) {
        console.log(`Not enough fee: expected '${config.FEE_PER_TRANSACTION}' got '${(sumOfInputsAmount - sumOfOutputsAmount)}'`);
        throw new TransactionException(`Not enough fee: expected '${config.FEE_PER_TRANSACTION}' got '${(sumOfInputsAmount - sumOfOutputsAmount)}'`, { sumOfInputsAmount, sumOfOutputsAmount, FEE_PER_TRANSACTION: config.FEE_PER_TRANSACTION });
      }
      if (negativeOutputsFound > 0) {
        console.log(`Transaction is either empty or negative, output(s) caught: '${negativeOutputsFound}'`);
        throw new TransactionException(`Transaction is either empty or negative, output(s) caught: '${negativeOutputsFound}'`);
      }
    }

    return true;
  }

  static fromJson(data) {
    let transaction = new Transaction();
    R.forEachObjIndexed((value, key) => { transaction[key] = value; }, data);
    transaction.hash = transaction.toHash();
    return transaction;
  }
}

module.exports = Transaction;
