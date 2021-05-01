// const Blockchain = require('./blockchain');


// let blockchain = new Blockchain();
// console.log(blockchain.getAllBlocks());

// blockchain.getAllBlocks();


const BASE_DIFFICULTY = Number.MAX_SAFE_INTEGER;
const EVERY_X_BLOCKS = 5;
const POW_CURVE = 5;

console.log(Math.max(Math.floor(BASE_DIFFICULTY / Math.pow(Math.floor(((1 || 2) + 1) / EVERY_X_BLOCKS) + 1, POW_CURVE)), 0));
