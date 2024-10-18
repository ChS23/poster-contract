import Web3 from 'web3';
import PosterABI from '../../contract/build/contracts/Poster.json';

const contractAddress = '0x4808292Ae8fccD8d38E893ec1929806814e9c072';

export const getContract = (web3: Web3) => {
  console.log(PosterABI.abi)
  return new web3.eth.Contract(PosterABI.abi as any, contractAddress);
};