'use client';

import { useState, useEffect, useCallback } from 'react';
import Web3 from 'web3';
import { getContract } from '@/utils/contract';

interface Post {
  user: string;
  content: string;
  tag: string;
}

const BLOCK_RANGE = 5000;
const POSTS_PER_PAGE = 10;
const AMOY_CHAIN_ID = '0x13882';
const AMOY_RPC_URL = 'https://rpc-amoy.polygon.technology';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function Home() {
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [contract, setContract] = useState<any>(null);
  const [account, setAccount] = useState<string>('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState({ content: '', tag: '' });
  const [filter, setFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const switchToAmoyNetwork = async () => {
    if (!window.ethereum) return false;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: AMOY_CHAIN_ID }],
      });
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: AMOY_CHAIN_ID,
                chainName: 'Polygon Amoy Testnet',
                nativeCurrency: {
                  name: 'POL',
                  symbol: 'POL',
                  decimals: 18
                },
                rpcUrls: [AMOY_RPC_URL],
                blockExplorerUrls: ['https://www.oklink.com/amoy'],
              },
            ],
          });
          return true;
        } catch (addError) {
          console.error('Failed to add Polygon Amoy network', addError);
        }
      }
      console.error('Failed to switch to Polygon Amoy network', switchError);
    }
    return false;
  };

  const initWeb3 = useCallback(async () => {
    if (typeof window !== 'undefined' && typeof window.ethereum !== 'undefined') {
      const web3Instance = new Web3(window.ethereum);
      setWeb3(web3Instance);
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          const chainId = await web3Instance.eth.getChainId();
          if (chainId !== BigInt(parseInt(AMOY_CHAIN_ID, 16))) {
            const switched = await switchToAmoyNetwork();
            if (!switched) {
              setErrorMessage("Please switch to Polygon Amoy testnet manually.");
              return;
            }
          }
          setAccount(accounts[0]);
          const contractInstance = getContract(web3Instance);
          setContract(contractInstance);
          await loadPosts(contractInstance, web3Instance);
        }
      } catch (error) {
        console.error("Failed to initialize", error);
        setErrorMessage("Failed to initialize. Please try again.");
      }
    } else {
      console.log('Please install MetaMask!');
      setErrorMessage("MetaMask not detected. Please install MetaMask.");
    }
  }, []);

  useEffect(() => {
    initWeb3();
  }, [initWeb3]);

  const connectWallet = async () => {
    if (isConnecting || !web3) return;
    setIsConnecting(true);
    try {
      const switched = await switchToAmoyNetwork();
      if (!switched) {
        setErrorMessage("Please switch to Polygon Amoy testnet manually.");
        return;
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      const contractInstance = getContract(web3);
      setContract(contractInstance);
      await loadPosts(contractInstance, web3);
      console.log("Wallet connected:", accounts[0]);
    } catch (error) {
      console.error("Failed to connect to MetaMask", error);
      setErrorMessage("Failed to connect to MetaMask. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const loadPosts = async (contractInstance: any, web3Instance: Web3) => {
    if (!contractInstance || !web3Instance) return;
    setLoadingPosts(true);
    console.log("Loading posts...");
    try {
      const latestBlock = parseInt(String(await web3Instance.eth.getBlockNumber()));
      let fromBlock = Math.max(0, latestBlock - BLOCK_RANGE);
      let allPosts: Post[] = [];

      while (fromBlock <= latestBlock) {
        const toBlock = Math.min(fromBlock + BLOCK_RANGE, latestBlock);
        const events = await contractInstance.getPastEvents('NewPost', {
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
        });
        console.log(`Fetched events from block ${fromBlock} to ${toBlock}`);
        const loadedPosts: Post[] = events.map((event: any) => ({
          user: event.returnValues.user,
          content: event.returnValues.content,
          tag: event.returnValues.tag,
        }));
        allPosts = [...loadedPosts, ...allPosts];
        fromBlock = toBlock + 1;
      }

      setPosts(allPosts);
      console.log("Posts loaded successfully.");
    } catch (error) {
      console.error("Error loading posts:", error);
      setErrorMessage("Error loading posts. Please try again.");
    } finally {
      setLoadingPosts(false);
    }
  };

  const handlePost = async () => {
    if (!contract || !account || isPosting) return;
    setIsPosting(true);
    setErrorMessage('');

    try {
      // Check network
      const chainId = await web3!.eth.getChainId();
      if (chainId !== BigInt(parseInt(AMOY_CHAIN_ID, 16))) {
        const switched = await switchToAmoyNetwork();
        if (!switched) {
          throw new Error("Please switch to Polygon Amoy testnet manually.");
        }
      }

      // Check balance
      const balance = await web3!.eth.getBalance(account);
      console.log("Account balance:", web3!.utils.fromWei(balance, 'ether'), "POL");

      if (parseFloat(web3!.utils.fromWei(balance, 'ether')) <= 0) {
        throw new Error("Insufficient balance to post. Please add some POL to your account.");
      }

      // Validate input
      if (newPost.content.trim() === '' || newPost.tag.trim() === '') {
        throw new Error("Content and tag cannot be empty.");
      }

      // Get current gas price
      const gasPrice = await web3!.eth.getGasPrice();
      console.log("Current gas price:", gasPrice);

      // Estimate gas
      const gasEstimate = await contract.methods.post(newPost.content, newPost.tag).estimateGas({ from: account });
      console.log("Estimated gas:", gasEstimate);

      // Send transaction
      const tx = await contract.methods.post(newPost.content, newPost.tag).send({
        from: account,
        gas: Math.floor(Number(gasEstimate) * 1.5).toString(),
        gasPrice: gasPrice,
      });

      console.log("Transaction successful:", tx);
      setNewPost({ content: '', tag: '' });
      await loadPosts(contract, web3!);
    } catch (error: any) {
      console.error("Transaction error:", error);
      if (error.message.includes("User denied transaction signature")) {
        setErrorMessage("Transaction was rejected. Please try again.");
      } else if (error.message.includes("insufficient funds")) {
        setErrorMessage("Insufficient funds to cover gas costs. Please add more POL to your account.");
      } else if (error.message.includes("execution reverted")) {
        setErrorMessage("Transaction reverted. There might be an issue with the contract. Please try again later.");
      } else {
        setErrorMessage(`Transaction failed: ${error.message}`);
      }
    } finally {
      setIsPosting(false);
    }
  };

  const filteredPosts = posts.filter((post) =>
    filter === '' || post.tag.toLowerCase().includes(filter.toLowerCase())
  );

  const indexOfLastPost = currentPage * POSTS_PER_PAGE;
  const indexOfFirstPost = indexOfLastPost - POSTS_PER_PAGE;
  const currentPosts = filteredPosts.slice(indexOfFirstPost, indexOfLastPost);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-md mx-auto">
            <div>
              <h1 className="text-2xl font-semibold">Poster DApp</h1>
            </div>
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                {errorMessage && (
                  <div className="text-red-500 text-sm mb-4">{errorMessage}</div>
                )}
                {!account ? (
                  <button
                    onClick={connectWallet}
                    disabled={isConnecting}
                    className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                ) : (
                  <>
                    <p>Connected: {account}</p>
                    <div>
                      <input
                        type="text"
                        placeholder="Content"
                        value={newPost.content}
                        onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                      <input
                        type="text"
                        placeholder="Tag"
                        value={newPost.tag}
                        onChange={(e) => setNewPost({ ...newPost, tag: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                      <button 
                        onClick={handlePost} 
                        className="mt-2 bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50" 
                        disabled={isPosting || !newPost.content || !newPost.tag}
                      >
                        {isPosting ? 'Posting...' : 'Post'}
                      </button>
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Filter by tag"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                    </div>
                    {loadingPosts ? (
                      <div>Loading posts...</div>
                    ) : (
                      <>
                        <div>
                          {currentPosts.map((post, index) => (
                            <div key={index} className="border p-4 mb-2 rounded">
                              <p className="text-sm text-gray-500">User: {post.user}</p>
                              <p>{post.content}</p>
                              <p className="text-sm text-blue-500">#{post.tag}</p>
                            </div>
                          ))}
                        </div>
                        <div>
                          {Array.from({ length: Math.ceil(filteredPosts.length / POSTS_PER_PAGE) }, (_, i) => (
                            <button 
                              key={i} 
                              onClick={() => paginate(i + 1)} 
                              className={`mx-1 px-3 py-1 rounded ${currentPage === i + 1 ? 'bg-blue-700 text-white' : 'bg-blue-500 text-white'}`}
                            >
                              {i + 1}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}