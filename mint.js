import fs from 'fs/promises';
import axios from "axios";
import chalk from "chalk";
import { ethers } from "ethers";

// Define mint parameters
const amount = 1;
const RPC_URL = "https://mainnet.base.org"; // Replace with a reliable RPC provider
const CONTRACT_ADDRESS = "0xb06C68C8f9DE60107eAbda0D7567743967113360";
const ABI = [
    "function mint(uint256 amount, address to) public"
];
// Connect to the provider
const provider = new ethers.JsonRpcProvider(RPC_URL);

async function readWallets() {
    try {
        await fs.access("wallets.json");
        const data = await fs.readFile("wallets.json", "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.info("No wallets found in wallets.json");
            return [];
        }
        throw err;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms * 1000));
}

async function mint(toAddress, privateKey) {
    // Create a wallet signer
    const wallet = new ethers.Wallet(privateKey, provider);

    // Get contract instance
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    try {
        // Send the mint transaction
        const tx = await contract.mint(amount, toAddress, {
            gasLimit: 0x2e52a, // Optional: specify if needed
            maxFeePerGas: 0x3567e0, // Optional: specify if needed
            maxPriorityFeePerGas: 0x3567e0, // Optional: specify if needed
        });

        console.log("Transaction sent:", tx.hash);

        // Wait for confirmation
        const receipt = await tx.wait();
        console.log("Transaction confirmed!");
    } catch (error) {
        console.error("Minting failed:", error);
    }
}

const logger = {
    verbose: true,

    _formatTimestamp() {
        return chalk.gray(`[${new Date().toLocaleTimeString()}]`);
    },

    _getLevelStyle(level) {
        const styles = {
            info: chalk.blueBright.bold,
            warn: chalk.yellowBright.bold,
            error: chalk.redBright.bold,
            success: chalk.greenBright.bold,
            debug: chalk.magentaBright.bold,
            verbose: chalk.cyan.bold
        };
        return styles[level] || chalk.white;
    },

    _formatError(error) {
        if (!error) return '';

        let errorDetails = '';
        if (axios.isAxiosError(error)) {
            errorDetails = `
            Status: ${error.response?.status || 'N/A'}
            Status Text: ${error.response?.statusText || 'N/A'}
            URL: ${error.config?.url || 'N/A'}
            Method: ${error.config?.method?.toUpperCase() || 'N/A'}
            Response Data: ${JSON.stringify(error.response?.data || {}, null, 2)}
            Headers: ${JSON.stringify(error.config?.headers || {}, null, 2)}`;
        }
        return `${error.message}${errorDetails}`;
    },

    log(level, message, value = '', error = null) {
        const timestamp = this._formatTimestamp();
        const levelStyle = this._getLevelStyle(level);
        const levelTag = levelStyle(`[${level.toUpperCase()}]`);
        const header = chalk.cyan('◆ LayerEdge Auto Bot');

        let formattedMessage = `${header} ${timestamp} ${levelTag} ${message}`;

        if (value) {
            const formattedValue = typeof value === 'object' ? JSON.stringify(value) : value;
            const valueStyle = level === 'error' ? chalk.red :
                             level === 'warn' ? chalk.yellow :
                             chalk.green;
            formattedMessage += ` ${valueStyle(formattedValue)}`;
        }

        if (error && this.verbose) {
            formattedMessage += `\n${chalk.red(this._formatError(error))}`;
        }

        console.log(formattedMessage);
    },

    info: (message, value = '') => logger.log('info', message, value),
    warn: (message, value = '') => logger.log('warn', message, value),
    error: (message, value = '', error = null) => logger.log('error', message, value, error),
    success: (message, value = '') => logger.log('success', message, value),
    debug: (message, value = '') => logger.log('debug', message, value),
    verbose: (message, value = '') => logger.verbose && logger.log('verbose', message, value),

    progress(wallet, step, status) {
        const progressStyle = status === 'success'
            ? chalk.green('✔')
            : status === 'failed'
            ? chalk.red('✘')
            : chalk.yellow('➤');

        console.log(
            chalk.cyan('◆ LayerEdge Auto Bot'),
            chalk.gray(`[${new Date().toLocaleTimeString()}]`),
            chalk.blueBright(`[PROGRESS]`),
            `${progressStyle} ${wallet} - ${step}`
        );
    }
};

class RequestHandler {
    static async makeRequest(config, retries = 30, backoffMs = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                logger.verbose(`Attempting request (${i + 1}/${retries})`, `URL: ${config.url}`);
                const response = await axios(config);
                logger.verbose(`Request successful`, `Status: ${response.status}`);
                return response;
            } catch (error) {
                const isLastRetry = i === retries - 1;
                const status = error.response?.status;

                if (status === 500) {
                    logger.error(`Server Error (500)`, `Attempt ${i + 1}/${retries}`, error);
                    if (isLastRetry) break;

                    const waitTime = backoffMs * Math.pow(1.5, i);
                    logger.warn(`Waiting ${waitTime/1000}s before retry...`);
                    await delay(waitTime/1000);
                    continue;
                }

                if (isLastRetry) {
                    logger.error(`Max retries reached`, '', error);
                    return null;
                }

                logger.warn(`Request failed`, `Attempt ${i + 1}/${retries}`, error);
                await delay(2);
            }
        }
        return null;
    }
}

async function makeRequest(method, url, config = {}) {
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://layeredge.io',
        'Referer': 'https://layeredge.io/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    };

    const axiosConfig = {
        timeout: 60000,
        headers: headers,
        validateStatus: (status) => status < 500
    };

    const finalConfig = {
        method,
        url,
        ...axiosConfig,
        ...config,
        headers: {
            ...headers,
            ...(config.headers || {})
        }
    };

    return await RequestHandler.makeRequest(finalConfig, 30);
}


async function verifyNFT( address, privateKey ) {
    const wallet = new ethers.Wallet(privateKey, provider);

    const timestamp = Date.now();
    const message = `I am claiming my SBT verification points for ${address} at ${timestamp}`;
    const sign = await wallet.signMessage(message);

    const dataSign = {
        walletAddress: address,
        timestamp: timestamp,
        sign: sign,
    };

    try {
        const config = {
            data: dataSign,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const response = await makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/task/nft-verification/1`,
            config
        );
        if (response && response.data) {
            console.log("NFT Verification Result:", response.data);
            return true;
        } else {
            console.error("Failed NFT Verification");
            return false;
        }
    } catch (error) {
        console.error("Error in NFT Verification:", error.response?.data || error.message);
        return false;
    }
}

async function run() {
    let wallets = await readWallets();
    const wallet = wallets[0];
    const { address, privateKey } = wallet;

    await mint( address, privateKey );
    await verifyNFT( address, privateKey );
}

run();
