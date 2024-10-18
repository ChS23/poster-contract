'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Web3 from 'web3';
import { keccak256 } from 'web3-utils';
import { getContract } from '@/utils/contract';
import { motion, AnimatePresence } from 'framer-motion';

interface Post {
  user: string;
  content: string;
  tag: string;
}

const BLOCK_RANGE = 5000;
const POSTS_PER_PAGE = 5;
const AMOY_CHAIN_ID = '0x13882';
const AMOY_RPC_URL = 'https://rpc-amoy.polygon.technology';
const MAX_TAG_LENGTH = 20;

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
  const [searchTag, setSearchTag] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
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
            params: [{
              chainId: AMOY_CHAIN_ID,
              chainName: 'Polygon Amoy Testnet',
              nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
              rpcUrls: [AMOY_RPC_URL],
              blockExplorerUrls: ['https://www.oklink.com/amoy'],
            }],
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
        }
        const contractInstance = getContract(web3Instance);
        setContract(contractInstance);
        await loadPosts(contractInstance, web3Instance);
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
      console.log("Wallet connected:", accounts[0]);
    } catch (error) {
      console.error("Failed to connect to MetaMask", error);
      setErrorMessage("Failed to connect to MetaMask. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const loadPosts = async (contractInstance: any, web3Instance: Web3, tag?: string) => {
    if (!contractInstance || !web3Instance) return;
    setIsSearching(true);
    console.log("Loading posts...");
    try {
      const latestBlock = Number(await web3Instance.eth.getBlockNumber());
      let fromBlock = Math.max(0, latestBlock - BLOCK_RANGE);
      let allPosts: Post[] = [];

      while (fromBlock <= latestBlock) {
        const toBlock = Math.min(fromBlock + BLOCK_RANGE, latestBlock);
        const events = await contractInstance.getPastEvents('NewPost', {
          fromBlock: fromBlock,
          toBlock: toBlock,
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

      if (tag) {
        const tagHash = keccak256(tag);
        allPosts = allPosts.filter(post => post.tag === tagHash);
      }

      setPosts(allPosts);
      console.log("Posts loaded successfully.");
    } catch (error) {
      console.error("Error loading posts:", error);
      setErrorMessage("Error loading posts. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handlePost = async () => {
    if (!contract || !account || isPosting) return;
    setIsPosting(true);
    setErrorMessage('');

    try {
      const chainId = await web3!.eth.getChainId();
      if (chainId !== BigInt(parseInt(AMOY_CHAIN_ID, 16))) {
        const switched = await switchToAmoyNetwork();
        if (!switched) {
          throw new Error("Please switch to Polygon Amoy testnet manually.");
        }
      }

      const balance = await web3!.eth.getBalance(account);
      if (parseFloat(web3!.utils.fromWei(balance, 'ether')) <= 0) {
        throw new Error("Insufficient balance to post. Please add some POL to your account.");
      }

      if (!/^[a-zA-Z0-9]+$/.test(newPost.tag)) {
        throw new Error("Tag should contain only letters and numbers.");
      }
      if (newPost.tag.length > MAX_TAG_LENGTH) {
        throw new Error(`Tag should not exceed ${MAX_TAG_LENGTH} characters.`);
      }

      const gasPrice = await web3!.eth.getGasPrice();
      const gasEstimate = await contract.methods.post(newPost.content, newPost.tag).estimateGas({ from: account });

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
      setErrorMessage(error.message || "Transaction failed. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  const handleSearch = () => {
    if (contract && web3) {
      loadPosts(contract, web3, searchTag);
    }
  };

  const uniqueTags = Array.from(new Set(posts.map(post => post.tag)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-800 to-blue-900 text-white">
      <header className="py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-extrabold">Poster DApp</h1>
          {!account ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={connectWallet}
              disabled={isConnecting}
              className="bg-white text-purple-800 px-6 py-2 rounded-full font-semibold shadow-lg hover:bg-purple-100 transition duration-300"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </motion.button>
          ) : (
            <p className="text-sm font-medium">Connected: {account.slice(0, 6)}...{account.slice(-4)}</p>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="bg-red-600 text-white p-4 rounded-lg mb-6"
              >
                {errorMessage}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white bg-opacity-10 p-6 rounded-lg shadow-xl"
            >
              <h2 className="text-2xl font-bold mb-4">Create a Post</h2>
              <textarea
                placeholder="What's on your mind?"
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                className="w-full p-3 mb-4 bg-white bg-opacity-20 rounded-md focus:ring-2 focus:ring-purple-400 focus:bg-opacity-30 transition duration-300"
                rows={4}
              />
              <input
                type="text"
                placeholder="Add a tag (letters and numbers only, max 20 characters)"
                value={newPost.tag}
                onChange={(e) => setNewPost({ ...newPost, tag: e.target.value.slice(0, MAX_TAG_LENGTH) })}
                className="w-full p-3 mb-4 bg-white bg-opacity-20 rounded-md focus:ring-2 focus:ring-purple-400 focus:bg-opacity-30 transition duration-300"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handlePost}
                disabled={isPosting || !newPost.content || !newPost.tag}
                className="w-full bg-purple-600 text-white px-6 py-3 rounded-md font-semibold shadow-lg hover:bg-purple-700 transition duration-300 disabled:opacity-50"
              >
                {isPosting ? 'Posting...' : 'Post'}
              </motion.button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white bg-opacity-10 p-6 rounded-lg shadow-xl"
            >
              <h2 className="text-2xl font-bold mb-4">Search Posts</h2>
              <div className="flex space-x-2 mb-6">
                <input
                  type="text"
                  placeholder="Enter a tag to search"
                  value={searchTag}
                  onChange={(e) => setSearchTag(e.target.value)}
                  className="flex-grow p-3 bg-white bg-opacity-20 rounded-md focus:ring-2 focus:ring-purple-400 focus:bg-opacity-30 transition duration-300"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="bg-purple-600 text-white px-6 py-3 rounded-md font-semibold shadow-lg hover:bg-purple-700 transition duration-300 disabled:opacity-50"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </motion.button>
              </div>

              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-2">All Tags:</h3>
                <div className="flex flex-wrap gap-2">
                  {uniqueTags.map((tag, index) => (
                    <span key={index} className="bg-purple-500 text-white px-2 py-1 rounded-full text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {isSearching ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
                  <p className="mt-4 text-lg">Searching posts...</p>
                </div>
              ) : posts.length > 0 ? (
                <motion.div layout className="space-y-6">
                  <AnimatePresence>
                    {posts.map((post, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="bg-white bg-opacity-20 p-4 rounded-lg shadow-md hover:shadow-lg transition duration-300"
                      >
                        <p className="text-sm text-purple-300 mb-2">User: {post.user.slice(0, 6)}...{post.user.slice(-4)}</p>
                        <p className="text-lg mb-2">{post.content}</p>
                        <p className="text-sm text-purple-300">Tag: {post.tag}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <p className="text-center text-lg">No posts found. Try searching for a different tag.</p>
              )}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}