const Blockchain = require('./blockchain');


let blockchain = new Blockchain();
console.log(blockchain.getAllBlocks());
blockchain.addBlock({ "index": 1 });
blockchain.getAllBlocks();