// utils/web3.js

import Web3, { JSONRPC_ERR_CHAIN_DISCONNECTED, LocalWalletNotAvailableError, MethodNotFoundError } from "web3";

// Geth에서 제공하는 HTTP JSON-RPC 포트로 연결
const web3 = new Web3("http://localhost:8545");

export const getEtherBalance = async (address) => {
  const balance = await web3.eth.getBalance(address); // wei
  return web3.utils.fromWei(balance, 'ether'); // ether 단위로 변환
};

export default web3;



