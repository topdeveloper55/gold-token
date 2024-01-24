const { Telegraf } = require("telegraf");
const axios = require("axios");
const db = require("../models");
const TelUser = db.telusers;
const Counter = db.counters;
const Tx = db.txs;
const { Web3 } = require("web3");
const fs = require("fs");
const path = require("path");
const tokenAbiFile = fs.readFileSync(path.resolve(__dirname, "./abi.json"));
const tokenAbi = JSON.parse(tokenAbiFile);

const delay = (duration) =>
  new Promise((resolve, reject) => {
    try {
      setTimeout(() => {
        resolve();
      }, [duration * 1000]);
    } catch (err) {
      reject();
    }
  });
module.exports = (app) => {
  const bot = new Telegraf(process.env.BOT_TOKEN);
  bot.launch();

  ////////
  bot.command("start", async (ctx) => {
    const data = await TelUser.find({ id: ctx.from.id });
    if (data.length == 0) {
      const user = await TelUser.find({ userName: ctx.from.username });
      if (user.length === 0) {
        await createAccount(
          ctx.from.id,
          ctx.from.username,
          ctx.from.first_name
        );
      } else {
        await TelUser.findOneAndUpdate(
          { userName: ctx.from.username },
          { id: ctx.from.id, displayName: ctx.from.first_name }
        );
      }
    } else {
      if (!data[0].userName) {
        await TelUser.findOneAndUpdate(
          { id: ctx.from.id },
          { userName: ctx.from.username }
        );
      }
    }
    bot.telegram.sendMessage(
      ctx.chat.id,
      "Use these command to... \n1. Get your balance: /getBalance\n2. Deposit: /deposit\n3. Withdraw: /withdraw\n4. New Deposit Password: /newpassword\n5. Call this list: /refresh",
      {}
    );
  });

  bot.command("refresh", async (ctx) => {
    bot.telegram.sendMessage(
      ctx.chat.id,
      "Use these command to... \n1. Get your balance: /getBalance\n2. Deposit: /deposit\n3. Withdraw: /withdraw\n4. New Deposit Password: /newpassword\n5. Call this list: /refresh",
      {}
    );
  });

  //////
  bot.command("newpassword", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      let uniqueCode = "";
      const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (let i = 0; i < 8; i++) {
        uniqueCode += characters.charAt(
          Math.floor(Math.random() * characters.length)
        );
      }
      await TelUser.findOneAndUpdate(
        { id: ctx.from.id },
        { uniqueCode: uniqueCode },
        {
          useFindAndModify: false,
        }
      );
      await ctx.reply("Deposit password updated.");
      await ctx.reply(uniqueCode);
    }
  });
  //////
  bot.command("withdraw", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      setTimeout(async () => {
        await ctx.reply("/withdraw(ela/gold) <amount> <address>");
      }, 800);
      setTimeout(async () => {
        await ctx.reply(
          "Only withdraw to Elastos Smart Chain wallets. Network fees may occur.\n\nUse the following command to withdraw:"
        );
      }, 400);
    }
  });
  //////
  bot.command("withdrawela", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    const walletAddress = commandParts[2]; // Get the wallet address from the input
    const addressRegex = /(0x[0-9a-fA-F]{40})/; // Regular expression to match Ethereum wallet addresses
    if (addressRegex.test(walletAddress)) {
      const amount = parseFloat(commandParts[1]);
      if (!isNaN(amount) && amount > 0) {
        const userData = await TelUser.find({
          id: ctx.from.id,
        });
        if (userData[0].elaAmount < amount) {
          ctx.reply("You don't have enough Ela");
        } else {
          if (userData[0].elaAmount > amount + 0.0001) {
            ctx.reply("Processing");
            const web3 = new Web3("https://api.elastos.io/esc");
            const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const nonce = await web3.eth.getTransactionCount(
              account.address,
              "pending"
            );
            const rawTransaction = {
              from: process.env.PUBLIC_KEY,
              to: walletAddress,
              value: (amount * Math.pow(10, 18)).toString(),
              gas: "21000",
              gasPrice: await web3.eth.getGasPrice(),
              nonce: nonce,
            };
            const signedTx = await web3.eth.accounts.signTransaction(
              rawTransaction,
              process.env.PRIVATE_KEY
            );
            const receipt = await web3.eth.sendSignedTransaction(
              signedTx.rawTransaction
            );
            setTimeout(async () => {
              await ctx.reply(`Transaction completed`);
            }, 400);
            const transactioinData = await axios.post(
              `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
            );
            const transactionfee =
              (parseInt(transactioinData.data.result.gasLimit) *
                parseInt(transactioinData.data.result.gasPrice)) /
              Math.pow(10, 18);
            const user = await TelUser.find({
              id: ctx.from.id,
            });
            setTimeout(() => {
              ctx.reply(
                `Old balance:\nELA: ${parseFloat(
                  user[0].elaAmount.toFixed(12).toString()
                )}\nGOLD: ${parseFloat(
                  user[0].goldAmount.toFixed(12).toString()
                )}`
              );
            }, 800);
            const telUser = {
              id: ctx.from.id,
              displayName: ctx.from.first_name,
              userName: ctx.from.username,
              elaAmount: user[0].elaAmount - amount - transactionfee,
              goldAmount: user[0].goldAmount,
              uniqueCode: user[0].uniqueCode,
            };
            TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
              useFindAndModify: false,
            }).then((data) => {
              setTimeout(() => {
                ctx.reply(
                  `New balance:\nELA: ${parseFloat(
                    telUser.elaAmount.toFixed(12).toString()
                  )}\nGOLD: ${parseFloat(
                    telUser.goldAmount.toFixed(12).toString()
                  )}`
                );
              }, 1200);
            });
          }
        }
      } else {
        ctx.reply("Invalid amount provided. Please provide a valid amount.");
      }
    } else {
      // If the input does not contain a valid Ethereum wallet address
      ctx.reply(
        "Invalid wallet address provided. Please provide a valid Elastos Smart Chain wallet address."
      );
    }
  });

  ///
  bot.command("test", async (ctx) => {
    const user = await TelUser.find({ id: ctx.from.id });
    if (!user[0].freeWithdrawCounter) {
      await TelUser.findOneAndUpdate({ id: ctx.from.id }, { freeWithdrawCounter: 1 })
    } else {
      if (user[0].freeWithdrawCounter < 10) {
        await TelUser.findOneAndUpdate({ id: ctx.from.id }, { freeWithdrawCounter: user[0].freeWithdrawCounter + 1 })
      } else {
        ctx.reply("Please deposit some ELA to cover the network fees.")
      }

    }
  })
  ///////
  bot.command("withdrawgold", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    const walletAddress = commandParts[2]; // Get the wallet address from the input
    const addressRegex = /(0x[0-9a-fA-F]{40})/; // Regular expression to match Ethereum wallet addresses
    if (addressRegex.test(walletAddress)) {
      const amount = parseFloat(commandParts[1]);
      if (!isNaN(amount) && amount > 0) {
        const userData = await TelUser.find({
          id: ctx.from.id,
        });
        if (userData[0].goldAmount >= amount) {
          const WalletData = await axios.post(
            `https://esc.elastos.io/api/?module=account&action=balance&address=${process.env.PUBLIC_KEY}`
          );
          const walletBalance =
            parseInt(WalletData.data.result) / Math.pow(10, 18);
          if (userData[0].elaAmount > 0.0001) {
            ctx.reply("Processing");
            const web3 = new Web3("https://api.elastos.io/esc");
            const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const tokenContract = new web3.eth.Contract(
              tokenAbi,
              process.env.GOLD_TOKEN_ADDRESS
            );
            const toAddress = walletAddress;
            const goldAmount = parseInt(amount * Math.pow(10, 18)).toString();
            const data = tokenContract.methods
              .transfer(toAddress, goldAmount)
              .encodeABI();
            const nonce = await web3.eth.getTransactionCount(
              account.address,
              "pending"
            );
            const gasPrice = await web3.eth.getGasPrice();
            const rawTransaction = {
              nonce: web3.utils.toHex(nonce),
              gasPrice: web3.utils.toHex(gasPrice),
              gasLimit: web3.utils.toHex(80000), // You may need to adjust the gas limit based on the token transfer function
              to: process.env.GOLD_TOKEN_ADDRESS,
              value: "0x00",
              data: data,
            };
            const signedTx = await web3.eth.accounts.signTransaction(
              rawTransaction,
              process.env.PRIVATE_KEY
            );
            const receipt = await web3.eth.sendSignedTransaction(
              signedTx.rawTransaction
            );
            ctx.reply(`Transaction completed`);
            const transactioinData = await axios.post(
              `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
            );
            const transactionfee =
              (parseInt(transactioinData.data.result.gasLimit) *
                parseInt(transactioinData.data.result.gasPrice)) /
              Math.pow(10, 18);
            const user = await TelUser.find({
              id: ctx.from.id,
            });
            setTimeout(() => {
              ctx.reply(
                `Old balance:\nELA: ${parseFloat(
                  user[0].elaAmount.toFixed(12).toString()
                )}\nGOLD: ${parseFloat(
                  user[0].goldAmount.toFixed(12).toString()
                )}`
              );
            }, 400);
            const telUser = {
              id: ctx.from.id,
              displayName: ctx.from.first_name,
              userName: ctx.from.username,
              elaAmount: user[0].elaAmount - transactionfee,
              goldAmount: user[0].goldAmount - amount,
              uniqueCode: user[0].uniqueCode,
            };
            TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
              useFindAndModify: false,
            }).then((data) => {
              setTimeout(() => {
                ctx.reply(
                  `New balance:\nELA: ${parseFloat(
                    telUser.elaAmount.toFixed(12).toString()
                  )}\nGOLD: ${parseFloat(
                    telUser.goldAmount.toFixed(12).toString()
                  )}`
                );
              }, 800);
            });
          } else {

            const nowDate = new Date().getUTCFullYear() + "." + (new Date().getUTCMonth() + 1) + "." + new Date().getDate();
            const counterTemp = await Counter.find({ date: nowDate });
            if (counterTemp.length === 0) {

              const counter = new Counter({
                date: nowDate,
                counter: 1
              })
              counter.save()
              const users = await TelUser.find({});
              let totalEla = 0;
              for (let i = 0; i < users.length; i++) {
                if (users[i].elaAmount > 0) {
                  totalEla += users[i].elaAmount
                }
              }

              if (walletBalance > totalEla + 0.0001) {
                console.log("------------>")
                if (!userData[0].freeWithdrawCounter) {
                  await TelUser.findOneAndUpdate({ id: ctx.from.id }, { freeWithdrawCounter: 1 })
                  ctx.reply("Processing");
                  const web3 = new Web3("https://api.elastos.io/esc");
                  const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
                  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
                  const tokenContract = new web3.eth.Contract(
                    tokenAbi,
                    process.env.GOLD_TOKEN_ADDRESS
                  );
                  const toAddress = walletAddress;
                  const goldAmount = parseInt(amount * Math.pow(10, 18)).toString();
                  const data = tokenContract.methods
                    .transfer(toAddress, goldAmount)
                    .encodeABI();
                  const nonce = await web3.eth.getTransactionCount(
                    account.address,
                    "pending"
                  );
                  const gasPrice = await web3.eth.getGasPrice();
                  const rawTransaction = {
                    nonce: web3.utils.toHex(nonce),
                    gasPrice: web3.utils.toHex(gasPrice),
                    gasLimit: web3.utils.toHex(80000), // You may need to adjust the gas limit based on the token transfer function
                    to: process.env.GOLD_TOKEN_ADDRESS,
                    value: "0x00",
                    data: data,
                  };
                  const signedTx = await web3.eth.accounts.signTransaction(
                    rawTransaction,
                    process.env.PRIVATE_KEY
                  );
                  const receipt = await web3.eth.sendSignedTransaction(
                    signedTx.rawTransaction
                  );
                  ctx.reply(`Transaction completed`);
                  const transactioinData = await axios.post(
                    `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
                  );
                  const transactionfee =
                    (parseInt(transactioinData.data.result.gasLimit) *
                      parseInt(transactioinData.data.result.gasPrice)) /
                    Math.pow(10, 18);
                  const user = await TelUser.find({
                    id: ctx.from.id,
                  });
                  setTimeout(() => {
                    ctx.reply(
                      `Old balance:\nELA: ${parseFloat(
                        user[0].elaAmount.toFixed(12).toString()
                      )}\nGOLD: ${parseFloat(
                        user[0].goldAmount.toFixed(12).toString()
                      )}`
                    );
                  }, 400);
                  const telUser = {
                    id: ctx.from.id,
                    displayName: ctx.from.first_name,
                    userName: ctx.from.username,
                    elaAmount: 0,
                    goldAmount: user[0].goldAmount - amount,
                    uniqueCode: user[0].uniqueCode,
                  };
                  await TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
                    useFindAndModify: false,
                  }).then((data) => {
                    setTimeout(() => {
                      ctx.reply(
                        `New balance:\nELA: ${parseFloat(
                          telUser.elaAmount.toFixed(12).toString()
                        )}\nGOLD: ${parseFloat(
                          telUser.goldAmount.toFixed(12).toString()
                        )}`
                      );
                    }, 800);
                  });
                  const finalUser = await TelUser.find({ id: ctx.from.id })
                  setTimeout(() => {
                    ctx.reply(`Free withdrawals left ${10 - finalUser[0].freeWithdrawCounter}/10. Ela deposit for network fees required if depleted.`)
                  }, 1200)
                } else {
                  if (userData[0].freeWithdrawCounter < 10) {
                    await TelUser.findOneAndUpdate({ id: ctx.from.id }, { freeWithdrawCounter: userData[0].freeWithdrawCounter + 1 })
                    ctx.reply("Processing");
                    const web3 = new Web3("https://api.elastos.io/esc");
                    const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
                    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
                    const tokenContract = new web3.eth.Contract(
                      tokenAbi,
                      process.env.GOLD_TOKEN_ADDRESS
                    );
                    const toAddress = walletAddress;
                    const goldAmount = parseInt(amount * Math.pow(10, 18)).toString();
                    const data = tokenContract.methods
                      .transfer(toAddress, goldAmount)
                      .encodeABI();
                    const nonce = await web3.eth.getTransactionCount(
                      account.address,
                      "pending"
                    );
                    const gasPrice = await web3.eth.getGasPrice();
                    const rawTransaction = {
                      nonce: web3.utils.toHex(nonce),
                      gasPrice: web3.utils.toHex(gasPrice),
                      gasLimit: web3.utils.toHex(80000), // You may need to adjust the gas limit based on the token transfer function
                      to: process.env.GOLD_TOKEN_ADDRESS,
                      value: "0x00",
                      data: data,
                    };
                    const signedTx = await web3.eth.accounts.signTransaction(
                      rawTransaction,
                      process.env.PRIVATE_KEY
                    );
                    const receipt = await web3.eth.sendSignedTransaction(
                      signedTx.rawTransaction
                    );
                    ctx.reply(`Transaction completed`);
                    const transactioinData = await axios.post(
                      `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
                    );
                    const transactionfee =
                      (parseInt(transactioinData.data.result.gasLimit) *
                        parseInt(transactioinData.data.result.gasPrice)) /
                      Math.pow(10, 18);
                    const user = await TelUser.find({
                      id: ctx.from.id,
                    });
                    setTimeout(() => {
                      ctx.reply(
                        `Old balance:\nELA: ${parseFloat(
                          user[0].elaAmount.toFixed(12).toString()
                        )}\nGOLD: ${parseFloat(
                          user[0].goldAmount.toFixed(12).toString()
                        )}`
                      );
                    }, 400);
                    const telUser = {
                      id: ctx.from.id,
                      displayName: ctx.from.first_name,
                      userName: ctx.from.username,
                      elaAmount: 0,
                      goldAmount: user[0].goldAmount - amount,
                      uniqueCode: user[0].uniqueCode,
                    };
                    TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
                      useFindAndModify: false,
                    }).then((data) => {
                      setTimeout(() => {
                        ctx.reply(
                          `New balance:\nELA: ${parseFloat(
                            telUser.elaAmount.toFixed(12).toString()
                          )}\nGOLD: ${parseFloat(
                            telUser.goldAmount.toFixed(12).toString()
                          )}`
                        );
                      }, 800);
                    });
                    const finalUser = await TelUser.find({ id: ctx.from.id })
                    setTimeout(() => {
                      ctx.reply(`Free withdrawals left ${10 - finalUser[0].freeWithdrawCounter}/10. Ela deposit for network fees required if depleted.`)
                    }, 1200)
                  } else {
                    ctx.reply("Please deposit some ELA to cover the network fees.")
                  }
                }

              } else {
                ctx.reply("Please deposit some ELA to cover the network fees.");
              }
            } else {
              if (counterTemp[0].counter < 20) {

                await Counter.findOneAndUpdate({ date: nowDate }, { counter: counterTemp[0].counter + 1 })
                const users = await TelUser.find({});
                let totalEla = 0;
                for (let i = 0; i < users.length; i++) {
                  if (users[i].elaAmount > 0) {
                    totalEla += users[i].elaAmount
                  }
                }

                if (walletBalance > totalEla + 0.0001) {

                  if (!userData[0].freeWithdrawCounter) {
                    await TelUser.findOneAndUpdate({ id: ctx.from.id }, { freeWithdrawCounter: 1 })
                    ctx.reply("Processing");
                    const web3 = new Web3("https://api.elastos.io/esc");
                    const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
                    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
                    const tokenContract = new web3.eth.Contract(
                      tokenAbi,
                      process.env.GOLD_TOKEN_ADDRESS
                    );
                    const toAddress = walletAddress;
                    const goldAmount = parseInt(amount * Math.pow(10, 18)).toString();
                    const data = tokenContract.methods
                      .transfer(toAddress, goldAmount)
                      .encodeABI();
                    const nonce = await web3.eth.getTransactionCount(
                      account.address,
                      "pending"
                    );
                    const gasPrice = await web3.eth.getGasPrice();
                    const rawTransaction = {
                      nonce: web3.utils.toHex(nonce),
                      gasPrice: web3.utils.toHex(gasPrice),
                      gasLimit: web3.utils.toHex(80000), // You may need to adjust the gas limit based on the token transfer function
                      to: process.env.GOLD_TOKEN_ADDRESS,
                      value: "0x00",
                      data: data,
                    };
                    const signedTx = await web3.eth.accounts.signTransaction(
                      rawTransaction,
                      process.env.PRIVATE_KEY
                    );
                    const receipt = await web3.eth.sendSignedTransaction(
                      signedTx.rawTransaction
                    );
                    ctx.reply(`Transaction completed`);
                    const transactioinData = await axios.post(
                      `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
                    );
                    const transactionfee =
                      (parseInt(transactioinData.data.result.gasLimit) *
                        parseInt(transactioinData.data.result.gasPrice)) /
                      Math.pow(10, 18);
                    const user = await TelUser.find({
                      id: ctx.from.id,
                    });
                    setTimeout(() => {
                      ctx.reply(
                        `Old balance:\nELA: ${parseFloat(
                          user[0].elaAmount.toFixed(12).toString()
                        )}\nGOLD: ${parseFloat(
                          user[0].goldAmount.toFixed(12).toString()
                        )}`
                      );
                    }, 400);
                    const telUser = {
                      id: ctx.from.id,
                      displayName: ctx.from.first_name,
                      userName: ctx.from.username,
                      elaAmount: 0,
                      goldAmount: user[0].goldAmount - amount,
                      uniqueCode: user[0].uniqueCode,
                    };
                    TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
                      useFindAndModify: false,
                    }).then((data) => {
                      setTimeout(() => {
                        ctx.reply(
                          `New balance:\nELA: ${parseFloat(
                            telUser.elaAmount.toFixed(12).toString()
                          )}\nGOLD: ${parseFloat(
                            telUser.goldAmount.toFixed(12).toString()
                          )}`
                        );
                      }, 800);
                    });
                    const finalUser = await TelUser.find({ id: ctx.from.id })
                    setTimeout(() => {
                      ctx.reply(`Free withdrawals left ${10 - finalUser[0].freeWithdrawCounter}/10. Ela deposit for network fees required if depleted.`)
                    }, 1200)
                  } else {
                    if (userData[0].freeWithdrawCounter < 10) {
                      await TelUser.findOneAndUpdate({ id: ctx.from.id }, { freeWithdrawCounter: userData[0].freeWithdrawCounter + 1 })
                      ctx.reply("Processing");
                      const web3 = new Web3("https://api.elastos.io/esc");
                      const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
                      const account = web3.eth.accounts.privateKeyToAccount(privateKey);
                      const tokenContract = new web3.eth.Contract(
                        tokenAbi,
                        process.env.GOLD_TOKEN_ADDRESS
                      );
                      const toAddress = walletAddress;
                      const goldAmount = parseInt(amount * Math.pow(10, 18)).toString();
                      const data = tokenContract.methods
                        .transfer(toAddress, goldAmount)
                        .encodeABI();
                      const nonce = await web3.eth.getTransactionCount(
                        account.address,
                        "pending"
                      );
                      const gasPrice = await web3.eth.getGasPrice();
                      const rawTransaction = {
                        nonce: web3.utils.toHex(nonce),
                        gasPrice: web3.utils.toHex(gasPrice),
                        gasLimit: web3.utils.toHex(80000), // You may need to adjust the gas limit based on the token transfer function
                        to: process.env.GOLD_TOKEN_ADDRESS,
                        value: "0x00",
                        data: data,
                      };
                      const signedTx = await web3.eth.accounts.signTransaction(
                        rawTransaction,
                        process.env.PRIVATE_KEY
                      );
                      const receipt = await web3.eth.sendSignedTransaction(
                        signedTx.rawTransaction
                      );
                      ctx.reply(`Transaction completed`);
                      const transactioinData = await axios.post(
                        `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
                      );
                      const transactionfee =
                        (parseInt(transactioinData.data.result.gasLimit) *
                          parseInt(transactioinData.data.result.gasPrice)) /
                        Math.pow(10, 18);
                      const user = await TelUser.find({
                        id: ctx.from.id,
                      });
                      setTimeout(() => {
                        ctx.reply(
                          `Old balance:\nELA: ${parseFloat(
                            user[0].elaAmount.toFixed(12).toString()
                          )}\nGOLD: ${parseFloat(
                            user[0].goldAmount.toFixed(12).toString()
                          )}`
                        );
                      }, 400);
                      const telUser = {
                        id: ctx.from.id,
                        displayName: ctx.from.first_name,
                        userName: ctx.from.username,
                        elaAmount: 0,
                        goldAmount: user[0].goldAmount - amount,
                        uniqueCode: user[0].uniqueCode,
                      };
                      TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
                        useFindAndModify: false,
                      }).then((data) => {
                        setTimeout(() => {
                          ctx.reply(
                            `New balance:\nELA: ${parseFloat(
                              telUser.elaAmount.toFixed(12).toString()
                            )}\nGOLD: ${parseFloat(
                              telUser.goldAmount.toFixed(12).toString()
                            )}`
                          );
                        }, 800);
                      });
                      const finalUser = await TelUser.find({ id: ctx.from.id })
                      setTimeout(() => {
                        ctx.reply(`Free withdrawals left ${10 - finalUser[0].freeWithdrawCounter}/10. Ela deposit for network fees required if depleted.`)
                      }, 1200)
                    } else {
                      ctx.reply("Please deposit some ELA to cover the network fees.");
                    }
                  }
                } else {
                  ctx.reply("Please deposit some ELA to cover the network fees.");
                }
              } else {
                ctx.reply("Please deposit some ELA to cover the network fees.")
              }
            }
          }

        } else {
          ctx.reply("You don't have enough Gold");
        }
      } else {
        ctx.reply("Invalid amount provided. Please provide a valid amount.");
      }
    } else {
      // If the input does not contain a valid Ethereum wallet address
      ctx.reply(
        "Invalid wallet address provided. Please provide a valid Elastos Smart Chain wallet address."
      );
    }
  });
  ///////
  bot.command("withdrawnugget", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    const walletAddress = commandParts[2]; // Get the wallet address from the input
    const addressRegex = /(0x[0-9a-fA-F]{40})/; // Regular expression to match Ethereum wallet addresses
    if (addressRegex.test(walletAddress)) {
      const amount = parseFloat(commandParts[1]) / Math.pow(10, 8);
      if (!isNaN(amount) && amount > 0) {
        const userData = await TelUser.find({
          id: ctx.from.id,
        });
        if (userData[0].goldAmount >= amount) {
          const WalletData = await axios.post(
            `https://esc.elastos.io/api/?module=account&action=balance&address=${process.env.PUBLIC_KEY}`
          );
          const walletBalance =
            parseInt(WalletData.data.result) / Math.pow(10, 8);

          if (walletBalance > 0.0001) {
            ctx.reply("Processing");
            const web3 = new Web3("https://api.elastos.io/esc");
            const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const tokenContract = new web3.eth.Contract(
              tokenAbi,
              process.env.GOLD_TOKEN_ADDRESS
            );
            const toAddress = walletAddress;
            const goldAmount = parseInt(amount * Math.pow(10, 18)).toString();
            console.log("goldamount---->", goldAmount)
            const data = tokenContract.methods
              .transfer(toAddress, goldAmount)
              .encodeABI();
            const nonce = await web3.eth.getTransactionCount(
              account.address,
              "pending"
            );
            const gasPrice = await web3.eth.getGasPrice();
            const rawTransaction = {
              nonce: web3.utils.toHex(nonce),
              gasPrice: web3.utils.toHex(gasPrice),
              gasLimit: web3.utils.toHex(80000), // You may need to adjust the gas limit based on the token transfer function
              to: process.env.GOLD_TOKEN_ADDRESS,
              value: "0x00",
              data: data,
            };
            const signedTx = await web3.eth.accounts.signTransaction(
              rawTransaction,
              process.env.PRIVATE_KEY
            );
            const receipt = await web3.eth.sendSignedTransaction(
              signedTx.rawTransaction
            );
            ctx.reply(`Transaction completed`);
            const transactioinData = await axios.post(
              `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
            );
            const transactionfee =
              (parseInt(transactioinData.data.result.gasLimit) *
                parseInt(transactioinData.data.result.gasPrice)) /
              Math.pow(10, 18);
            const user = await TelUser.find({
              id: ctx.from.id,
            });
            setTimeout(() => {
              ctx.reply(
                `Old balance:\nELA: ${parseFloat(
                  user[0].elaAmount.toFixed(12).toString()
                )}\nGOLD: ${parseFloat(
                  user[0].goldAmount.toFixed(12).toString()
                )}`
              );
            }, 400);
            const telUser = {
              id: ctx.from.id,
              displayName: ctx.from.first_name,
              userName: ctx.from.username,
              elaAmount: user[0].elaAmount - transactionfee,
              goldAmount: user[0].goldAmount - amount,
              uniqueCode: user[0].uniqueCode,
            };
            TelUser.findOneAndUpdate({ userName: ctx.from.username }, telUser, {
              useFindAndModify: false,
            }).then((data) => {
              setTimeout(() => {
                ctx.reply(
                  `New balance:\nELA: ${parseFloat(
                    telUser.elaAmount.toFixed(12).toString()
                  )}\nGOLD: ${parseFloat(
                    telUser.goldAmount.toFixed(12).toString()
                  )}`
                );
              }, 800);
            });
          } else {
            ctx.reply("ELA insufficient. Please deposit ELA for gas");
          }
        } else {
          ctx.reply("You don't have enough Gold");
        }
      } else {
        ctx.reply("Invalid amount provided. Please provide a valid amount.");
      }
    } else {
      // If the input does not contain a valid Ethereum wallet address
      ctx.reply(
        "Invalid wallet address provided. Please provide a valid Elastos Smart Chain wallet address."
      );
    }
  });
  ///////
  bot.command("withdrawdust", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    const walletAddress = commandParts[2]; // Get the wallet address from the input
    const addressRegex = /(0x[0-9a-fA-F]{40})/; // Regular expression to match Ethereum wallet addresses
    if (addressRegex.test(walletAddress)) {
      const amount = parseFloat(commandParts[1]) / Math.pow(10, 12);
      if (!isNaN(amount) && amount > 0) {
        const userData = await TelUser.find({
          id: ctx.from.id,
        });
        if (userData[0].goldAmount >= amount) {
          const WalletData = await axios.post(
            `https://esc.elastos.io/api/?module=account&action=balance&address=${process.env.PUBLIC_KEY}`
          );
          const walletBalance =
            parseInt(WalletData.data.result) / Math.pow(10, 18);

          if (walletBalance > 0.0001) {
            ctx.reply("Processing");
            const web3 = new Web3("https://api.elastos.io/esc");
            const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const tokenContract = new web3.eth.Contract(
              tokenAbi,
              process.env.GOLD_TOKEN_ADDRESS
            );
            const toAddress = walletAddress;
            const goldAmount = parseInt(amount * Math.pow(10, 18)).toString();
            const data = tokenContract.methods
              .transfer(toAddress, goldAmount)
              .encodeABI();
            const nonce = await web3.eth.getTransactionCount(
              account.address,
              "pending"
            );
            const gasPrice = await web3.eth.getGasPrice();
            const rawTransaction = {
              nonce: web3.utils.toHex(nonce),
              gasPrice: web3.utils.toHex(gasPrice),
              gasLimit: web3.utils.toHex(80000), // You may need to adjust the gas limit based on the token transfer function
              to: process.env.GOLD_TOKEN_ADDRESS,
              value: "0x00",
              data: data,
            };
            const signedTx = await web3.eth.accounts.signTransaction(
              rawTransaction,
              process.env.PRIVATE_KEY
            );
            const receipt = await web3.eth.sendSignedTransaction(
              signedTx.rawTransaction
            );
            ctx.reply(`Transaction completed`);
            const transactioinData = await axios.post(
              `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
            );
            const transactionfee =
              (parseInt(transactioinData.data.result.gasLimit) *
                parseInt(transactioinData.data.result.gasPrice)) /
              Math.pow(10, 18);
            const user = await TelUser.find({
              id: ctx.from.id,
            });
            setTimeout(() => {
              ctx.reply(
                `Old balance:\nELA: ${parseFloat(
                  user[0].elaAmount.toFixed(12).toString()
                )}\nGOLD: ${parseFloat(
                  user[0].goldAmount.toFixed(12).toString()
                )}`
              );
            }, 400);
            const telUser = {
              id: ctx.from.id,
              displayName: ctx.from.first_name,
              userName: ctx.from.username,
              elaAmount: user[0].elaAmount - transactionfee,
              goldAmount: user[0].goldAmount - amount,
              uniqueCode: user[0].uniqueCode,
            };
            TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
              useFindAndModify: false,
            }).then((data) => {
              setTimeout(() => {
                ctx.reply(
                  `New balance:\nELA: ${parseFloat(
                    telUser.elaAmount.toFixed(12).toString()
                  )}\nGOLD: ${parseFloat(
                    telUser.goldAmount.toFixed(12).toString()
                  )}`
                );
              }, 800);
            });
          } else {
            ctx.reply("ELA insufficient. Please deposit ELA for gas");
          }
        } else {
          ctx.reply("You don't have enough Gold");
        }
      } else {
        ctx.reply("Invalid amount provided. Please provide a valid amount.");
      }
    } else {
      // If the input does not contain a valid Ethereum wallet address
      ctx.reply(
        "Invalid wallet address provided. Please provide a valid Elastos Smart Chain wallet address."
      );
    }
  });

  //
  bot.command("getBalance", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      TelUser.find({ id: ctx.from.id }).then(async (data) => {
        if (data.length == 0) {
          const user = await TelUser.find({ userName: ctx.from.username });
          if (user.length === 0) {
            const response = await createAccount(
              ctx.from.id,
              ctx.from.username,
              ctx.from.first_name
            );
            if (response == "success") {
              ctx.reply(`Ela: 0 \nGold: 0`);
            }
          } else {
            TelUser.findOneAndUpdate(
              { userName: ctx.from.username },
              { id: ctx.from.id, displayName: ctx.from.first_name }
            ).then((data) => {
              ctx.reply(
                `Ela: ${parseFloat(
                  data.elaAmount.toFixed(12).toString()
                )} \nGold: ${parseFloat(
                  data.goldAmount.toFixed(12).toString()
                )}`
              );
            });
          }
        } else {
          let elaAmount = data[0].elaAmount;
          let goldAmount = data[0].goldAmount;
          if (data[0].elaAmount < 0.00000001) {
            elaAmount = 0;
          } else if (data[0].goldAmount < 0.00000001) {
            goldAmount = 0;
          }
          if (!data[0].userName) {
            await TelUser.findOneAndUpdate(
              { id: ctx.from.id },
              { userName: ctx.from.username }
            );
          }

          await ctx.reply(
            `Ela: ${parseFloat(
              elaAmount.toFixed(12).toString()
            )} \nGold: ${parseFloat(goldAmount.toFixed(12).toString())}`
          );
        }
      });
    }
  });
  //
  bot.command("deposit", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      let user = await TelUser.find({ id: ctx.from.id });
      if (user.length === 0) {
        const data = await TelUser.find({ userName: ctx.from.username });
        if (data.length === 0) {
          await createAccount(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name
          );
        } else {
          await TelUser.findOneAndUpdate(
            { userName: ctx.from.username },
            { id: ctx.from.id, displayName: ctx.from.first_name }
          );
        }
        user = await TelUser.find({ id: ctx.from.id });
      }
      if (user[0].userName === "") {
        await TelUser.findOneAndUpdate(
          { id: ctx.from.id },
          { userName: ctx.from.username }
        );
      }
      for (let i = 0; i < 4; i++) {
        if (i === 0) {
          setTimeout(() => {
            ctx.reply(
              `Please only deposit ELA or GOLD, using the Elastos Smart Chain, to this address:`
            );
          }, 400);
        } else if (i === 1) {
          setTimeout(() => {
            ctx.reply(`${process.env.PUBLIC_KEY}`);
          }, 800);
        } else if (i === 2) {
          setTimeout(() => {
            ctx.reply(
              `Please copy paste the transaction ID, followed by this password, separated with a space.`
            );
          }, 1200);
        } else if (i === 3) {
          setTimeout(() => {
            ctx.reply(`${user[0].uniqueCode}`);
          }, 1600);
        }
      }
    }
  });
  //////
  bot.command("tipela", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    if (commandParts.length < 3) {
      if (commandParts.length === 2) {
        if (ctx.update.message.reply_to_message) {
          const userName = ctx.update.message.reply_to_message.from.username;
          const receiverUserId = ctx.update.message.reply_to_message.from.id;
          const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
          const displayName =
            ctx.update.message.reply_to_message.from.first_name;
          let nickName;
          if (userName === undefined) {
            nickName = ctx.update.message.reply_to_message.from.first_name;
          } else {
            nickName = "@" + ctx.update.message.reply_to_message.from.username;
          }
          const amount = parseFloat(amountString);
          let decimalLength;
          if (amountString.split(".").length > 1) {
            const sublength = amountString.split(".")[1];
            decimalLength = sublength.length;
          } else {
            decimalLength = 0;
          }
          if (amount > 0 && amount !== null) {
            if (decimalLength > 12) {
              ctx.reply("Please tip ELA within 12 decimal.");
            } else {
              if (amount < 0.000000000001) {
                ctx.reply(
                  "Please tip 0.000000000001 Units of ELA/GOLD or more."
                );
              } else {
                const user = await TelUser.find({ id: receiverUserId });
                const senderUser = await TelUser.find({
                  id: ctx.from.id,
                });
                if (user[0].id === senderUser[0].id) {
                  await ctx.reply(
                    `${nickName} received ${amountString} ELA from @ElastosGoldTipbot`
                  );
                } else {
                  if (user.length === 0) {
                    let uniqueCode = "";
                    const characters =
                      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                    for (let i = 0; i < 8; i++) {
                      uniqueCode += characters.charAt(
                        Math.floor(Math.random() * characters.length)
                      );
                    }
                    const telUser = new TelUser({
                      id: receiverUserId,
                      userName: userName,
                      displayName: displayName,
                      elaAmount: amount,
                      goldAmount: 0,
                      uniqueCode: uniqueCode,
                    });
                    telUser.save(telUser);
                    await ctx.reply(
                      `${nickName} received ${amountString} ELA from @ElastosGoldTipbot`
                    );
                  } else {
                    if (senderUser[0].elaAmount > amount) {
                      const receiveUser = {
                        id: receiverUserId,
                        displayName: displayName,
                        userName: user[0].userName,
                        elaAmount: user[0].elaAmount + amount,
                        goldAmount: user[0].goldAmount,
                        uniqueCode: user[0].uniqueCode,
                      };
                      const sendUser = {
                        id: ctx.from.id,
                        displayName: ctx.from.first_name,
                        userName: senderUser[0].userName,
                        elaAmount: senderUser[0].elaAmount - amount,
                        goldAmount: senderUser[0].goldAmount,
                        uniqueCode: senderUser[0].uniqueCode,
                      };
                      await TelUser.findOneAndUpdate(
                        { id: ctx.from.id },
                        sendUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await TelUser.findOneAndUpdate(
                        { id: receiverUserId },
                        receiveUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await ctx.reply(
                        `${nickName} received ${amountString} ELA from @ElastosGoldTipbot`
                      );
                    } else {
                      ctx.reply("You don't have enough ELA.");
                    }
                  }
                }
              }
            }
          } else {
            ctx.reply("Input Invalid.");
          }
        }
      } else {
        ctx.reply("/tipgold@elaPrinceBot");
      }
    } else {
      const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
      const amount = parseFloat(amountString);
      let decimalLength;
      if (amountString.split(".").length > 1) {
        const sublength = amountString.split(".")[1];
        decimalLength = sublength.length;
      } else {
        decimalLength = 0;
      }
      if (amount > 0 && amount !== null) {
        if (decimalLength > 12) {
          ctx.reply("Please tip ELA within 12 decimal.");
        } else {
          if (amount < 0.000000000001) {
            ctx.reply("Please tip 0.000000000001 Units of ELA/GOLD or more.");
          } else {
            if (commandParts[2].split("", 1)[0] === "@") {
              const userName = commandParts[2].substring(
                1,
                commandParts[2].length
              );
              const user = await TelUser.find({ userName: userName });
              const senderUser = await TelUser.find({
                userName: ctx.from.username,
              });
              if (user.length === 0) {
                const telUser = new TelUser({
                  id: "",
                  userName: userName,
                  displayName: "",
                  elaAmount: amount,
                  goldAmount: 0,
                  uniqueCode: generateUniqueCode(),
                });
                telUser.save();

                await ctx.reply(
                  `@${userName} received ${amountString} ELA from @ElastosGoldTipbot`
                );
              }
              else {
                if (user[0].id === senderUser[0].id) {
                  await ctx.reply(
                    `@${userName} received ${amountString} ELA from @ElastosGoldTipbot`
                  );
                }
                else {
                  if (senderUser[0].elaAmount > amount) {
                    const receiveUser = {
                      id: user[0].id,
                      displayName: user[0].displayName,
                      userName: user[0].userName,
                      elaAmount: user[0].elaAmount + amount,
                      goldAmount: user[0].goldAmount,
                      uniqueCode: user[0].uniqueCode,
                    };
                    const sendUser = {
                      id: senderUser[0].id,
                      displayName: senderUser[0].displayName,
                      userName: senderUser[0].userName,
                      elaAmount: senderUser[0].elaAmount - amount,
                      goldAmount: senderUser[0].goldAmount,
                      uniqueCode: senderUser[0].uniqueCode,
                    };
                    await TelUser.findOneAndUpdate(
                      { id: ctx.from.id },
                      sendUser,
                      {
                        useFindAndModify: false,
                      }
                    ).then((data) => { });
                    await TelUser.findOneAndUpdate(
                      { id: user[0].id },
                      receiveUser,
                      {
                        useFindAndModify: false,
                      }
                    ).then((data) => { });
                    await ctx.reply(
                      `@${userName} received ${amountString} ELA from @ElastosGoldTipbot`
                    );
                  } else {
                    ctx.reply("You don't have enough ELA.");
                  }
                }
              }
            } else {
              ctx.reply("Incorrect format.");
            }
          }
        }
      } else {
        ctx.reply("Input Invalid.");
      }
    }
  });

  ////
  bot.command("tiphelp", async (ctx) => {
    ctx.reply(
      "To start tipping use the following command:\n\n/tip(ela/gold/nugget/dust) <amount> <@-handle>"
    );
    setTimeout(() => {
      ctx.reply(
        "If tipping as a reply to someone:\n\n/tip(ela/gold/nugget/dust) <amount>"
      );
    }, 500)
  });
  //////
  bot.command("tipgold", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    if (commandParts.length < 3) {
      if (commandParts.length === 2) {
        if (ctx.update.message.reply_to_message) {
          const receiverUserId = ctx.update.message.reply_to_message.from.id;
          const userName = ctx.update.message.reply_to_message.from.username;
          const displayName =
            ctx.update.message.reply_to_message.from.first_name;
          let nickName;
          if (userName === undefined) {
            nickName = ctx.update.message.reply_to_message.from.first_name;
          } else {
            nickName = "@" + ctx.update.message.reply_to_message.from.username;
          }
          const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
          const amount = parseFloat(amountString);
          let decimalLength;
          if (amountString.split(".").length > 1) {
            const sublength = amountString.split(".")[1];
            decimalLength = sublength.length;
          } else {
            decimalLength = 0;
          }
          if (amount > 0 && amount !== null) {
            if (decimalLength > 12) {
              ctx.reply("Please tip GOLD within 12 decimal.");
            } else {
              if (amount < 0.000000000001) {
                ctx.reply(
                  "Please tip 0.000000000001 Units of ELA/GOLD or more."
                );
              } else {
                const user = await TelUser.find({ id: receiverUserId });
                const senderUser = await TelUser.find({
                  id: ctx.from.id,
                });
                if (user.length === 0) {
                  await createAccount(receiverUserId, userName, displayName);
                  const user = await TelUser.find({ id: receiverUserId });
                  const receiveUser = {
                    id: receiverUserId,
                    displayName: displayName,
                    userName: user[0].userName,
                    elaAmount: user[0].elaAmount,
                    goldAmount: user[0].goldAmount + amount,
                    uniqueCode: user[0].uniqueCode,
                  };
                  await TelUser.findOneAndUpdate(
                    { id: receiverUserId },
                    receiveUser,
                    {
                      useFindAndModify: false,
                    }
                  )
                  await ctx.reply(
                    `${nickName} received ${amountString} GOLD from @ElastosGoldTipbot`
                  );
                } else {
                  if (user[0].id === senderUser[0].id) {
                    await ctx.reply(
                      `${nickName} received ${amountString} GOLD from @ElastosGoldTipbot`
                    );
                  } else {
                    if (senderUser[0].goldAmount > amount) {
                      const receiveUser = {
                        id: receiverUserId,
                        displayName: displayName,
                        userName: user[0].userName,
                        elaAmount: user[0].elaAmount,
                        goldAmount: user[0].goldAmount + amount,
                        uniqueCode: user[0].uniqueCode,
                      };
                      const sendUser = {
                        id: ctx.from.id,
                        displayName: ctx.from.first_name,
                        userName: senderUser[0].userName,
                        elaAmount: senderUser[0].elaAmount,
                        goldAmount: senderUser[0].goldAmount - amount,
                        uniqueCode: senderUser[0].uniqueCode,
                      };
                      await TelUser.findOneAndUpdate(
                        { id: ctx.from.id },
                        sendUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await TelUser.findOneAndUpdate(
                        { id: receiverUserId },
                        receiveUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await ctx.reply(
                        `${nickName} received ${amountString} GOLD from @ElastosGoldTipbot`
                      );
                    } else {
                      ctx.reply("You don't have enough GOLD.");
                    }
                  }
                }
              }
            }
          } else {
            ctx.reply("Input Invalid.");
          }
        }
      } else {
        ctx.reply("/tipgold@elaPrinceBot");
      }
    } else {
      const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
      const amount = parseFloat(amountString);
      let decimalLength;
      if (amountString.split(".").length > 1) {
        const sublength = amountString.split(".")[1];
        decimalLength = sublength.length;
      } else {
        decimalLength = 0;
      }
      if (amount > 0 && amount !== null) {
        if (decimalLength > 12) {
          ctx.reply("Please tip GOLD within 12 decimal.");
        } else {
          if (amount < 0.000000000001) {
            ctx.reply("Please tip 0.000000000001 Units of ELA/GOLD or more.");
          } else {
            if (commandParts[2].split("", 1)[0] === "@") {
              const userName = commandParts[2].substring(
                1,
                commandParts[2].length
              );
              const user = await TelUser.find({ userName: userName });
              const senderUser = await TelUser.find({
                userName: ctx.from.username,
              });
              if (user.length === 0) {
                const telUser = new TelUser({
                  id: "",
                  userName: userName,
                  displayName: "",
                  elaAmount: 0,
                  goldAmount: amount,
                  uniqueCode: generateUniqueCode(),
                });
                telUser.save();
                await ctx.reply(
                  `@${userName} received ${amountString} GOLD from @ElastosGoldTipbot`
                );
              } else {
                if (user[0].id === senderUser[0].id) {
                  await ctx.reply(
                    `@${userName} received ${amountString} GOLD from @ElastosGoldTipbot`
                  );
                } else {
                  if (user.length === 0) {
                    const telUser = new TelUser({
                      id: "",
                      userName: userName,
                      displayName: "",
                      elaAmount: 0,
                      goldAmount: amount,
                      uniqueCode: generateUniqueCode(),
                    });
                    telUser.save();
                    await ctx.reply(
                      `@${userName} received ${amountString} GOLD from @ElastosGoldTipbot`
                    );
                  } else {
                    if (senderUser[0].goldAmount > amount) {
                      const receiveUser = {
                        userName: user[0].userName,
                        elaAmount: user[0].elaAmount,
                        goldAmount: user[0].goldAmount + amount,
                        uniqueCode: user[0].uniqueCode,
                      };
                      const sendUser = {
                        userName: senderUser[0].userName,
                        elaAmount: senderUser[0].elaAmount,
                        goldAmount: senderUser[0].goldAmount - amount,
                        uniqueCode: senderUser[0].uniqueCode,
                      };
                      await TelUser.findOneAndUpdate(
                        { userName: ctx.from.username },
                        sendUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await TelUser.findOneAndUpdate(
                        { userName: userName },
                        receiveUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await ctx.reply(
                        `@${userName} received ${amountString} GOLD from @ElastosGoldTipbot`
                      );
                    } else {
                      ctx.reply("You don't have enough GOLD.");
                    }
                  }
                }
              }
            } else {
              ctx.reply("Incorrect format.");
            }
          }
        }
      } else {
        ctx.reply("Input Invalid.");
      }
    }
  });

  /////
  bot.command("tipnugget", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    if (commandParts.length < 3) {
      if (commandParts.length === 2) {
        if (ctx.update.message.reply_to_message) {
          const userName = ctx.update.message.reply_to_message.from.username;
          const receiverUserId = ctx.update.message.reply_to_message.from.id;
          const displayName =
            ctx.update.message.reply_to_message.from.first_name;
          let nickName;
          if (userName === undefined) {
            nickName = ctx.update.message.reply_to_message.from.first_name;
          } else {
            nickName = "@" + ctx.update.message.reply_to_message.from.username;
          }
          const amountElaString = detectFloatWithCommaOrPeriod(commandParts[1]);
          const amountEla = parseFloat(amountElaString);
          if (amountEla > 0 && amountEla !== null) {
            const amount = amountEla / Math.pow(10, 8);
            let decimalLength;
            if (amountElaString.split(".").length > 1) {
              const sublength = amountElaString.split(".")[1];
              decimalLength = sublength.length;
            } else {
              decimalLength = 0;
            }
            if (decimalLength > 4) {
              ctx.reply("Please tip NUGGET within 4 decimal.");
            } else {
              if (parseFloat(amountEla) < 0.0001) {
                ctx.reply("Please tip 0.0001 NUGGET or more.");
              } else {
                const user = await TelUser.find({ id: receiverUserId });
                const senderUser = await TelUser.find({
                  id: ctx.from.id,
                });
                if (user.length === 0) {
                  await createAccount(receiverUserId, userName, displayName);
                  const user = await TelUser.find({ id: receiverUserId });
                  const receiveUser = {
                    id: receiverUserId,
                    displayName: displayName,
                    userName: user[0].userName,
                    elaAmount: user[0].elaAmount,
                    goldAmount: user[0].goldAmount + amount,
                    uniqueCode: user[0].uniqueCode,
                  };
                  await TelUser.findOneAndUpdate(
                    { id: receiverUserId },
                    receiveUser,
                    {
                      useFindAndModify: false,
                    }
                  ).then((data) => { });
                  await ctx.reply(
                    `${nickName} received ${amountEla} (GOLD Satoshi) NUGGET from @ElastosGoldTipbot`
                  );
                }
                else {
                  if (user[0].id === senderUser[0].id) {
                    await ctx.reply(
                      `${nickName} received ${amountEla} (GOLD Satoshi) NUGGET from @ElastosGoldTipbot`
                    );
                  }
                  else {
                    if (senderUser[0].goldAmount > amount) {
                      const sendUser = {
                        id: senderUser[0].id,
                        displayName: senderUser[0].displayName,
                        userName: senderUser[0].userName,
                        elaAmount: senderUser[0].elaAmount,
                        goldAmount: senderUser[0].goldAmount - amount,
                        uniqueCode: senderUser[0].uniqueCode,
                      };
                      await TelUser.findOneAndUpdate(
                        { id: ctx.from.id },
                        sendUser,
                        {
                          useFindAndModify: false,
                        }
                      );
                      const receiveUser = {
                        id: receiverUserId,
                        displayName: displayName,
                        userName: user[0].userName,
                        elaAmount: user[0].elaAmount,
                        goldAmount: user[0].goldAmount + amount,
                        uniqueCode: user[0].uniqueCode,
                      };
                      await TelUser.findOneAndUpdate(
                        { id: receiverUserId },
                        receiveUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await ctx.reply(
                        `${nickName} received ${amountEla} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                      );
                    } else {
                      ctx.reply("You don't have enough NUGGET.");
                    }
                  }
                }
              }
            }
          } else {
            ctx.reply("Input Invalid.");
          }
        }
      } else ctx.reply("/tipgold@elaPrinceBot");
    } else {
      const amountElaString = detectFloatWithCommaOrPeriod(commandParts[1]);
      const amountEla = parseFloat(amountElaString);
      if (amountEla > 0 && amountEla !== null) {
        const amount = amountEla / Math.pow(10, 8);
        let decimalLength;
        if (amountElaString.split(".").length > 1) {
          const sublength = amountElaString.split(".")[1];
          decimalLength = sublength.length;
        } else {
          decimalLength = 0;
        }
        if (decimalLength > 4) {
          ctx.reply("Please tip NUGGET within 4 decimal.");
        } else {
          if (amountEla < 0.0001) {
            ctx.reply("Please tip 0.0001 NUGGET or more.");
          } else {
            if (commandParts[2].split("", 1)[0] === "@") {
              const userName = commandParts[2].substring(
                1,
                commandParts[2].length
              );
              const user = await TelUser.find({ userName: userName });
              const senderUser = await TelUser.find({
                userName: ctx.from.username,
              });
              if (user.length === 0) {
                const telUser = new TelUser({
                  id: "",
                  userName: userName,
                  displayName: "",
                  elaAmount: 0,
                  goldAmount: amount,
                  uniqueCode: generateUniqueCode(),
                });
                telUser.save();
                await ctx.reply(
                  `@${userName} received ${amountEla} (GOLD Satoshi) NUGGET from @ElastosGoldTipbot`
                );
              } else {
                if (user[0].id === senderUser[0].id) {
                  await ctx.reply(
                    `@${userName} received ${amountEla} (GOLD Satoshi) NUGGET from @ElastosGoldTipbot`
                  );
                } else {
                  if (senderUser[0].goldAmount > amount) {
                    const sendUser = {
                      userName: senderUser[0].userName,
                      elaAmount: senderUser[0].elaAmount,
                      goldAmount: senderUser[0].goldAmount - amount,
                      uniqueCode: senderUser[0].uniqueCode,
                    };
                    await TelUser.findOneAndUpdate(
                      { userName: ctx.from.username },
                      sendUser,
                      {
                        useFindAndModify: false,
                      }
                    ).then((data) => { });
                    const receiveUser = {
                      userName: user[0].userName,
                      elaAmount: user[0].elaAmount,
                      goldAmount: user[0].goldAmount + amount,
                      uniqueCode: user[0].uniqueCode,
                    };
                    await TelUser.findOneAndUpdate(
                      { userName: userName },
                      receiveUser,
                      {
                        useFindAndModify: false,
                      }
                    ).then((data) => { });
                    await ctx.reply(
                      `@${userName} received ${amountEla} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                    );
                  } else {
                    ctx.reply("You don't have enough NUGGET.");
                  }
                }
              }
            } else {
              ctx.reply("Incorrect format.");
            }
          }
        }
      } else {
        ctx.reply("Input Invalid.");
      }
    }
  });
  /////
  bot.command("tipdust", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    if (commandParts.length < 3) {
      if (commandParts.length === 2) {
        if (ctx.update.message.reply_to_message) {
          const userName = ctx.update.message.reply_to_message.from.username;
          const receiverUserId = ctx.update.message.reply_to_message.from.id;
          const displayName =
            ctx.update.message.reply_to_message.from.first_name;
          let nickName;
          if (userName === undefined) {
            nickName = ctx.update.message.reply_to_message.from.first_name;
          } else {
            nickName = "@" + ctx.update.message.reply_to_message.from.username;
          }
          const amountElaString = detectFloatWithCommaOrPeriod(commandParts[1]);
          const amountEla = parseFloat(amountElaString);
          if (amountEla > 0 && amountEla !== null) {
            const amount = amountEla / Math.pow(10, 12);
            let decimalLength;
            if (amountElaString.split(".").length > 1) {
              const sublength = amountElaString.split(".")[1];
              decimalLength = sublength.length;
            } else {
              decimalLength = 0;
            }
            if (decimalLength > 0) {
              ctx.reply("Please tip DUST using no decimal.");
            } else {
              if (calculateDecimal(amount) > 12) {
                ctx.reply("Please tip DUST using no decimal.");
              } else {
                const user = await TelUser.find({ id: receiverUserId });
                const senderUser = await TelUser.find({
                  id: ctx.from.id,
                });
                if (user.length === 0) {
                  await createAccount(receiverUserId, userName, displayName);
                  const user = await TelUser.find({ id: receiverUserId });
                  const receiveUser = {
                    id: receiverUserId,
                    displayName: displayName,
                    userName: user[0].userName,
                    elaAmount: user[0].elaAmount,
                    goldAmount: user[0].goldAmount + amount,
                    uniqueCode: user[0].uniqueCode,
                  };
                  await TelUser.findOneAndUpdate(
                    { userName: userName },
                    receiveUser,
                    {
                      useFindAndModify: false,
                    }
                  ).then((data) => { });
                  await ctx.reply(
                    `${nickName} received ${amountEla} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                  );
                } else {
                  if (user[0].id === senderUser[0].id) {
                    await ctx.reply(
                      `${nickName} received ${amountEla} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                    );

                  }
                  else {
                    if (senderUser[0].goldAmount > amount) {
                      const receiveUser = {
                        id: receiverUserId,
                        displayName: displayName,
                        userName: user[0].userName,
                        elaAmount: user[0].elaAmount,
                        goldAmount: user[0].goldAmount + amount,
                        uniqueCode: user[0].uniqueCode,
                      };
                      const sendUser = {
                        id: senderUser[0].id,
                        displayName: senderUser[0].displayName,
                        userName: senderUser[0].userName,
                        elaAmount: senderUser[0].elaAmount,
                        goldAmount: senderUser[0].goldAmount - amount,
                        uniqueCode: senderUser[0].uniqueCode,
                      };
                      await TelUser.findOneAndUpdate(
                        { id: ctx.from.id },
                        sendUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await TelUser.findOneAndUpdate(
                        { id: receiverUserId },
                        receiveUser,
                        {
                          useFindAndModify: false,
                        }
                      ).then((data) => { });
                      await ctx.reply(
                        `${nickName} received ${amountEla} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                      );
                    } else {
                      ctx.reply("You don't have enough DUST.");
                    }
                  }
                }
              }
            }
          } else {
            ctx.reply("Input Invalid.");
          }
        }
      } else ctx.reply("/tipgold@elaPrinceBot");
    } else {
      const amountElaString = detectFloatWithCommaOrPeriod(commandParts[1]);
      const amountEla = parseFloat(amountElaString);
      if (amountEla > 0 && amountEla !== null) {
        const amount = amountEla / Math.pow(10, 12);
        let decimalLength;
        if (amountElaString.split(".").length > 1) {
          const sublength = amountElaString.split(".")[1];
          decimalLength = sublength.length;
        } else {
          decimalLength = 0;
        }
        if (decimalLength > 0) {
          ctx.reply("Please tip DUST using no decimal.");
        } else {
          if (calculateDecimal(amount) > 12) {
            ctx.reply("Please tip DUST using no decimal.");
          } else {
            if (commandParts[2].split("", 1)[0] === "@") {
              const userName = commandParts[2].substring(
                1,
                commandParts[2].length
              );
              const user = await TelUser.find({ userName: userName });
              const senderUser = await TelUser.find({
                userName: ctx.from.username,
              });
              if (user.length === 0) {
                const telUser = new TelUser({
                  id: "",
                  userName: userName,
                  displayName: "",
                  elaAmount: 0,
                  goldAmount: amount,
                  uniqueCode: generateUniqueCode(),
                });
                telUser.save();
                await ctx.reply(
                  `@${userName} received ${amountEla} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                );
              }
              else {
                if (user[0].id === senderUser[0].id) {
                  await ctx.reply(
                    `@${userName} received ${amountEla} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                  );
                }
                else {
                  if (senderUser[0].goldAmount > amount) {
                    const receiveUser = {
                      userName: user[0].userName,
                      elaAmount: user[0].elaAmount,
                      goldAmount: user[0].goldAmount + amount,
                      uniqueCode: user[0].uniqueCode,
                    };
                    const sendUser = {
                      userName: senderUser[0].userName,
                      elaAmount: senderUser[0].elaAmount,
                      goldAmount: senderUser[0].goldAmount - amount,
                      uniqueCode: senderUser[0].uniqueCode,
                    };
                    await TelUser.findOneAndUpdate(
                      { userName: ctx.from.username },
                      sendUser,
                      {
                        useFindAndModify: false,
                      }
                    ).then((data) => { });
                    await TelUser.findOneAndUpdate(
                      { userName: userName },
                      receiveUser,
                      {
                        useFindAndModify: false,
                      }
                    ).then((data) => { });
                    await ctx.reply(
                      `@${userName} received ${amountEla} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                    );
                  } else {
                    ctx.reply("You don't have enough DUST.");
                  }
                }
              }
            } else {
              ctx.reply("Incorrect format.");
            }
          }
        }
      } else {
        ctx.reply("Input Invalid.");
      }
    }
  });

  ////////////
  bot.on("text", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      const inputText = ctx.message.text;
      const commandParts = inputText.split(" ");
      const transactionHashRegex = /^0x([A-Fa-f0-9]{64})$/;
      if (transactionHashRegex.test(commandParts[0])) {
        if (commandParts.length < 2) {
          const user = await TelUser.find({ id: ctx.from.id });
          setTimeout(() => {
            ctx.reply(
              "Please copy paste the transaction ID, followed by this password, separated with a space."
            );
          }, 400);
          setTimeout(() => {
            ctx.reply(user[0].uniqueCode);
          }, 800);
        } else {
          const user = await TelUser.find({ id: ctx.from.id });
          if (user[0].uniqueCode !== commandParts[1]) {
            ctx.reply("Your password is incorrect");
          } else {
            const data = await Tx.find({ tx: commandParts[0] });
            if (data.length == 0) {
              const response = await axios.post(
                `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${commandParts[0]}`
              );
              let token = "";
              if (response.data.result.logs.length == 0) {
                token = "ela";
              } else {
                if (
                  response.data.result.logs[0].address ==
                  "0xaa9691bce68ee83de7b518dfcbbfb62c04b1c0ba"
                ) {
                  token = "gold";
                }
              }
              const tx = new Tx({
                from: response.data.result.from,
                to: response.data.result.to,
                token: token,
                tx: commandParts[0],
              });
              await tx.save(tx);
              const user = await TelUser.find({ id: ctx.from.id });
              if (token == "ela") {
                const telUser = {
                  id: ctx.from.id,
                  displayName: ctx.from.first_name,
                  userName: ctx.from.username,
                  elaAmount:
                    user[0].elaAmount +
                    parseFloat(response.data.result.value) / Math.pow(10, 18),
                  goldAmount: user[0].goldAmount,
                };
                TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
                  useFindAndModify: false,
                }).then((data) => {
                  ctx.reply("Transaction completed");
                  setTimeout(() => {
                    ctx.reply(
                      `Old balance:\nELA: ${parseFloat(
                        user[0].elaAmount.toFixed(12).toString()
                      )}\nGOLD: ${parseFloat(
                        user[0].goldAmount.toFixed(12).toString()
                      )}`
                    );
                  }, 400);
                  setTimeout(() => {
                    ctx.reply(
                      `New balance:\nELA: ${parseFloat(
                        telUser.elaAmount.toFixed(12).toString()
                      )}\nGOLD: ${parseFloat(
                        telUser.goldAmount.toFixed(12).toString()
                      )}`
                    );
                  }, 800);
                });
              } else if (token == "gold") {
                const transferData = await axios.get(
                  `https://esc.elastos.io/tx/${commandParts[0]}/token-transfers?type=JSON`
                );
                const htmlContent = transferData.data.items[0];
                const regexResult =
                  /<span class="tile-title">\n\n(.*?)\n <a data-test="token_link" href="\/token\/.*?">(.*?)<\/a>\n\n/.exec(
                    htmlContent
                  );
                const amount = regexResult[1];
                const telUser = {
                  id: ctx.from.id,
                  displayName: ctx.from.first_name,
                  userName: ctx.from.username,
                  elaAmount: user[0].elaAmount,
                  goldAmount: user[0].goldAmount + parseFloat(amount),
                };
                TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
                  useFindAndModify: false,
                }).then((data) => {
                  ctx.reply("Transaction completed");
                  setTimeout(() => {
                    ctx.reply(
                      `Old balance:\nELA: ${parseFloat(
                        user[0].elaAmount.toFixed(12).toString()
                      )}\nGOLD: ${parseFloat(
                        user[0].goldAmount.toFixed(12).toString()
                      )}`
                    );
                  }, 400);
                  setTimeout(() => {
                    ctx.reply(
                      `New balance:\nELA: ${parseFloat(
                        telUser.elaAmount.toFixed(12).toString()
                      )}\nGOLD: ${parseFloat(
                        telUser.goldAmount.toFixed(12).toString()
                      )}`
                    );
                  }, 800);
                });
              }
            }
          }
        }
      }
    }
  });
};

const calculateDecimal = (amount) => {
  let decimalValue = amount.toString().indexOf(".");
  return amount.toString().substring(decimalValue).length - 1;
};
const generateUniqueCode = () => {
  let uniqueCode = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 8; i++) {
    uniqueCode += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  return uniqueCode;
};
const createAccount = (id, userName, displayName) =>
  new Promise(async (resolve, reject) => {
    let uniqueCode = "";
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 8; i++) {
      uniqueCode += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }
    const telUser = new TelUser({
      id: id,
      userName: userName,
      displayName: displayName,
      elaAmount: 0,
      goldAmount: 0,
      uniqueCode: uniqueCode,
    });
    telUser
      .save(telUser)
      .then((data) => {
        return resolve("success");
      })
      .catch((err) => {
        return reject("error");
      });
  });

const randomId = (decimal) => {
  let uniqueCode = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < decimal; i++) {
    uniqueCode += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  return uniqueCode;
};

function detectFloatWithCommaOrPeriod(value) {
  if (/^-?\d+(,\d+|\.\d+)?$/.test(value)) {
    value = value.replace(",", ".");
    return value;
  } else if (/^-?\d+(\.\d+)?,\d+$/.test(value)) {
    value = value.replace(".", "");
    value = value.replace(",", ".");
    return value;
  } else if (/(,\d+|\.\d+)?$/.test(value)) {
    value = "0" + value.replace(",", ".");
    return value;
  } else if (/(\.\d+)?,\d+$/.test(value)) {
    value = "0" + value.replace(".", "");
    value = "0" + value.replace(",", ".");
    return value;
  } else return null;
}
