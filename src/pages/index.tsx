/* eslint-disable jsx-a11y/alt-text */
import { BigNumber, Contract, ethers } from 'ethers'
import { Children, SetStateAction, useEffect, useState } from 'react'
import ConnectWallet from 'components/Connect/ConnectWallet'
import { useAccount, useProvider, useSigner } from 'wagmi'
import { parseFixed } from '@ethersproject/bignumber'
import FlipClockCountdown from '@leenguyen/react-flip-clock-countdown'
import '@leenguyen/react-flip-clock-countdown/dist/index.css'
import tokenAbi from './tokenabi.json'
import contractAbi from './abi.json'
import ComboBox from '../components/comboBox'
import { v4 } from 'uuid'
import Web3 from 'web3'

const GOLDTOKEN = '0x7647548A32B5f632f880B1F9c64b06E16433917D'
const ContractAddress = '0xcD7974680b7cB29591cB888693cE80ec2123a314'
export default function Home() {
  return (
    <div>
      <Main />
    </div>
  )
}

const period = [
  { period: 'None', multiply: 100 },
  { period: '3 month', multiply: 105 },
  { period: '6 month', multiply: 115 },
  { period: '12 month', multiply: 145 },
  { period: '24 month', multiply: 200 },
]

function Main() {
  const [stakingPeriod, setStakingPeriod] = useState(period[0])
  const [amount, setAmount] = useState<string>('0')
  const { data: signer, isError, isLoading } = useSigner()
  const { address } = useAccount()
  const [disable, setDisable] = useState(false)
  const [userStakedList, setUserStakedList] = useState([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [totalStakedAmount, setTotalStakedAmount] = useState(0)
  async function approve() {
    const amountToWei = parseFixed(amount, 18)
    const tokenContract = new Contract(GOLDTOKEN, tokenAbi, signer)
    const tx = await tokenContract.approve(ContractAddress, amountToWei)
    await tx.wait()
  }
  const handleChangeAmount = (e: { target: { value: SetStateAction<string> } }) => {
    setAmount(e.target.value)
  }
  const convertToNormalNum = (amount: { toString: () => string }) => {
    return parseInt(amount.toString()) / Math.pow(10, 18)
  }
  const convertMultiplyToPeriod = (multiply: number) => {
    return multiply == 0 ? 0 : multiply == 105 ? 180 : multiply == 115 ? 720 : 1440
  }
  const toDate = (sec: number) => {
    return new Date(sec * 1000).toString()
  }
  const toPeriod = (multiply: number) => {
    if (multiply === 100) {
      return 'None'
    } else if (multiply === 105) {
      return '3 Month'
    } else if (multiply === 115) {
      return '6 Month'
    } else if (multiply === 145) {
      return '12 Month'
    } else {
      return '24 Month'
    }
  }
  async function getStakingInfo() {
    if (address) {
      const web3 = new Web3('https://api-testnet.elastos.io/eth')
      const contract = new web3.eth.Contract(contractAbi, ContractAddress)
      let stakedTempList = []
      stakedTempList = await contract.methods.getStakeInfo(address).call()
      console.log('stakedTempList-------->', stakedTempList)
      let stakedList = []
      for (let i = 0; i < stakedTempList[0].length; i++) {
        const element = {
          amount: convertBigNumberToInt(stakedTempList[0][i].amount),
          multiply: convertBigNumberToInt(stakedTempList[0][i].multiply) * Math.pow(10, 18),
          period: toPeriod(convertBigNumberToInt(stakedTempList[0][i].multiply) * Math.pow(10, 18)),
          uuid: stakedTempList[0][i].uuid,
          unlockTimeToSec:
            convertBigNumberToInt(stakedTempList[0][i].unlockTime) * Math.pow(10, 18) -
            convertBigNumberToInt(stakedTempList[1]) * Math.pow(10, 18),
          unlockTime: new Date(
            new Date().getTime() +
              (convertBigNumberToInt(stakedTempList[0][i].unlockTime) * Math.pow(10, 18) -
                convertBigNumberToInt(stakedTempList[1]) * Math.pow(10, 18)) *
                1000
          ),
        }
        stakedList[i] = element
      }
      console.log('stakedList----->', stakedList)
      let totalStakedAmount = 0
      for (let i = 0; i < stakedList.length; i++) {
        totalStakedAmount += stakedList[i].amount
      }
      setTotalStakedAmount(totalStakedAmount)
      setUserStakedList(stakedList)
    }
  }
  async function getStakedAmount() {
    if (address) {
      const web3 = new Web3('https://api-testnet.elastos.io/eth')
      const contract = new web3.eth.Contract(contractAbi, ContractAddress)
      const stakedAmount = await contract.methods.getStakedAmount().call()
    }
  }
  const handleUnstake = (uuid: any) => {
    const stakingContract = new Contract(ContractAddress, contractAbi, signer)
    const calldata = stakingContract.interface.encodeFunctionData('unstake', [uuid])
    signer
      .estimateGas({
        to: ContractAddress,
        from: address,
        data: calldata,
      })
      .then(res => {
        return res.toNumber()
      })
      .then(est => {
        return signer.sendTransaction({
          from: address,
          to: ContractAddress,
          data: calldata,
          gasPrice: '20000000000',
          gasLimit: est.toString(),
        })
      })
      .then(res => {
        res.wait().then(() => {
          setDisable(false)
          getTotalSupply()
          getStakedAmount()
          getStakingInfo()
        })
      })
  }
  const handleChangeUnstake = (index: number) => {
    const updatedItems = userStakedList.map((item, i) => {
      if (i === index) {
        return { ...item, unlockTimeToSec: -1 }
      }
      return item
    })
    setUserStakedList(updatedItems)
  }
  const convertBigNumberToInt = value => {
    return Number(value) / Math.pow(10, 18)
  }
  async function getTotalSupply() {
    const web3 = new Web3('https://api-testnet.elastos.io/eth')
    const contract = new web3.eth.Contract(contractAbi, ContractAddress)
    const balance = await contract.methods.getContractTokenBalance().call()
    setTotalBalance(convertBigNumberToInt(balance))
  }
  async function staking() {
    setDisable(true)
    await approve()
    const uuid = await v4()
    const amountToWei = parseFixed(amount, 18)
    const stakingContract = new Contract(ContractAddress, contractAbi, signer)
    const calldata = stakingContract.interface.encodeFunctionData('stake', [amountToWei, stakingPeriod.multiply, uuid])
    await signer
      .estimateGas({
        to: ContractAddress,
        from: address,
        data: calldata,
      })
      .then(res => {
        return res.toNumber()
      })
      .then(est => {
        return signer.sendTransaction({
          from: address,
          to: ContractAddress,
          data: calldata,
          gasPrice: '20000000000',
          gasLimit: est.toString(),
        })
      })
      .then(res => {
        res.wait().then(() => {
          getTotalSupply()
          getStakedAmount()
          getStakingInfo()
          setDisable(false)
          console.log('res---------->', res.hash)
        })
      })
  }
  useEffect(() => {
    getStakingInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])
  useEffect(() => {
    getTotalSupply()
    getStakedAmount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`absolute w-full bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 font-sans text-white`}
    >
      <div className="relative flex h-[100px] w-full items-center bg-blue-950/40 backdrop-blur-sm">
        <div className="absolute left-[20px] flex h-[80%] items-center">
          <img className="h-full" src="logo.png" />
          <div className="ml-[15px] font-sans text-[24px] text-white">GOLD</div>
        </div>
        <div className="absolute right-[50px] h-[52px] w-[100px] mobile:w-[250px]">
          <ConnectWallet />
        </div>
      </div>
      <div className="mt-[40px] flex w-full items-center justify-center">
        <div className="grid w-full grid-cols-2 items-center justify-center gap-4 desktop:grid desktop:w-[1420px] desktop:grid-cols-4 desktop:gap-4">
          <div className="flex h-[200px] items-center justify-center rounded-[15px] bg-blue-950/40 backdrop-blur-sm">
            <div className="w-[80%]">
              <div className="mb-[10px] w-full text-[20px] mobile:text-[25px]">Total amount staked:</div>
              <div className="w-full text-[20px] mobile:text-[25px]">{totalBalance.toFixed(5)}</div>
            </div>
          </div>
          <div className="flex h-[200px] items-center justify-center rounded-[15px] bg-blue-950/40 backdrop-blur-sm">
            <div className="w-[80%]">
              <div className="mb-[10px] w-full text-[20px] mobile:text-[23px]">Gold distributed last 180 days:</div>
              <div className="w-full text-[20px] mobile:text-[23px]">0</div>
            </div>
          </div>
          <div className="flex h-[200px] items-center justify-center rounded-[15px] bg-blue-950/40 backdrop-blur-sm">
            <div className="w-[80%]">
              <div className="mb-[10px] w-full text-[20px] mobile:text-[30px]">ROI last year</div>
              <div className="w-full text-[20px] mobile:text-[30px]">0.8%</div>
            </div>
          </div>
          <div className="flex h-[200px] items-center justify-center rounded-[15px] bg-blue-950/40 backdrop-blur-sm">
            <div className="w-[80%]">
              <div className="mb-[10px] w-full text-[20px] mobile:text-[30px]">Stakers</div>
              <div className="w-full text-[20px] mobile:text-[30px]">124</div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-[40px] flex w-full items-center justify-center">
        <div className="w-full rounded-[30px] bg-blue-950/40 backdrop-blur-sm desktop:w-[1420px]">
          <div className="mt-[80px] flex w-full justify-center text-[30px] font-bold text-white">GOLD Staking</div>
          <div className="mt-[30px] w-full flex-row items-center justify-center text-white mobile:inline-flex ">
            <div className="mx-auto w-[80%] mobile:mx-1 mobile:w-auto">
              <div className="ml-[10px]">Stake GOLD</div>
              <input
                className="w-full rounded-[5px] border-[2px] border-sky-600 bg-transparent p-2 font-bold outline-none mobile:w-[320px]"
                onChange={handleChangeAmount}
              ></input>
            </div>
            <ComboBox period={period} stakingPeriod={stakingPeriod} setStakingPeriod={setStakingPeriod} />
            <button
              className="ml-[10%] mt-[40px] h-[45px] w-[80%] rounded-[7px] bg-indigo-700 text-[17px] font-semibold text-[#e2e1e1] shadow-lg shadow-cyan-500/50 hover:brightness-90 mobile:ml-[20px] mobile:mt-[25px] mobile:w-[150px]"
              onClick={staking}
              disabled={disable}
            >
              Staking
            </button>
          </div>
          <div className="mt-[30px] w-full flex-row items-center justify-center text-white mobile:inline-flex">
            <div className="mx-auto w-[80%] mobile:mx-1 mobile:w-auto">
              <div className="flex justify-center rounded-[15px]">
                <div className="ml-[10px] w-auto">
                  <div className="mb-[20px] mt-[40px] w-full text-[20px]">Staked List</div>
                  <div className="mb-[80px]">
                    <div className="sm:rounded-lg relative mb-[20px] w-auto overflow-x-auto rounded-lg shadow-md backdrop-blur-sm">
                      <table className="w-[680px] text-left text-sm text-white rtl:text-right">
                        <thead className="bg-transparent text-xs uppercase text-white dark:bg-gray-700">
                          <tr>
                            <th scope="col" className="px-6 py-3">
                              No
                            </th>
                            <th scope="col" className="px-6 py-3">
                              Amount
                            </th>
                            <th scope="col" className="px-6 py-3">
                              Multiply
                            </th>
                            <th scope="col" className="px-6 py-3">
                              Period
                            </th>
                            <th scope="col" className="flex items-center justify-center px-6 py-3">
                              Unstake
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-transparent">
                          {userStakedList.map((item, index) => {
                            return (
                              <>
                                <tr className="border-b dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-600">
                                  <th
                                    scope="row"
                                    className="whitespace-nowrap px-6 py-4 font-medium text-white dark:text-white"
                                  >
                                    {index + 1}
                                  </th>
                                  <td className="px-6 py-4">{item.amount}</td>
                                  <td className="px-6 py-4">{item.multiply}</td>
                                  <td className="px-6 py-4">{item.period}</td>
                                  <td className="flex items-center justify-center px-6 py-4">
                                    {item.unlockTimeToSec < 0 ? (
                                      <>
                                        <button
                                          className="rounded-md bg-indigo-700 p-2"
                                          onClick={() => {
                                            handleUnstake(item.uuid)
                                          }}
                                        >
                                          Unstake
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <FlipClockCountdown
                                          digitBlockStyle={{
                                            width: 20,
                                            height: 30,
                                            fontSize: 15,
                                          }}
                                          dividerStyle={{ color: 'transparent', height: 0 }}
                                          separatorStyle={{ color: 'white', size: '4px' }}
                                          labelStyle={{
                                            fontSize: 0,
                                            fontWeight: 0,
                                            color: 'transparent',
                                          }}
                                          to={item.unlockTime}
                                          onComplete={() => {
                                            handleChangeUnstake(index)
                                          }}
                                        />
                                      </>
                                    )}
                                  </td>
                                </tr>
                              </>
                            )
                          })}
                        </tbody>
                        <tfoot className="bg-transparent !pb-[20px] text-xs text-white dark:bg-gray-700">
                          <tr>
                            <th scope="col" className="px-6 py-4">
                              Total
                            </th>
                            <th scope="col" className="px-6 py-4">
                              {totalStakedAmount.toFixed(4)}
                            </th>
                            <th scope="col" className="px-6 py-4"></th>
                            <th scope="col" className="px-6 py-4"></th>
                            <th scope="col" className="px-6 py-4"></th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mb-[40px] mt-[40px] flex w-full items-center justify-center">
        <div className="grid w-full grid-cols-1 items-center justify-center gap-4 desktop:w-[1420px] desktop:grid-cols-2">
          <div className="flex justify-center rounded-[15px] bg-blue-950/40 backdrop-blur-sm">
            <div className="ml-[10px] w-[80%]">
              <div className="mb-[20px] mt-[40px] w-full text-[20px]">GOLD Staker Rich List</div>
              <div className="mb-[40px] w-full">
                <div className="sm:rounded-lg relative mb-[20px] overflow-x-auto shadow-md">
                  <table className="w-full text-left text-sm text-white rtl:text-right">
                    <thead className="bg-transparent text-xs uppercase text-white dark:bg-gray-700">
                      <tr>
                        <th scope="col" className="px-6 py-3">
                          No
                        </th>
                        <th scope="col" className="px-6 py-3">
                          Amount
                        </th>
                        <th scope="col" className="px-6 py-3">
                          Token
                        </th>
                        <th scope="col" className="px-6 py-3">
                          Address
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-transparent">
                      <tr className="border-b dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-600">
                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-medium text-white dark:text-white">
                          1
                        </th>
                        <td className="px-6 py-4">52</td>
                        <td className="px-6 py-4">GOLD</td>
                        <td className="px-6 py-4">0x13...3213</td>
                      </tr>
                      <tr className="border-b dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-600">
                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-medium text-white dark:text-white">
                          1
                        </th>
                        <td className="px-6 py-4">52</td>
                        <td className="px-6 py-4">GOLD</td>
                        <td className="px-6 py-4">0x13...3213</td>
                      </tr>
                      <tr className="border-b dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-600">
                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-medium text-white dark:text-white">
                          1
                        </th>
                        <td className="px-6 py-4">52</td>
                        <td className="px-6 py-4">GOLD</td>
                        <td className="px-6 py-4">0x13...3213</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-center rounded-[15px] bg-blue-950/40 backdrop-blur-sm">
            <div className="ml-[10px] w-[80%]">
              <div className="mb-[20px] mt-[40px] w-full text-[20px]">Recent Transactioins</div>
              <div className="mb-[40px] w-full">
                <div className="sm:rounded-lg relative mb-[20px] overflow-x-auto shadow-md">
                  <table className="w-full text-left text-sm text-white rtl:text-right">
                    <thead className="bg-transparent text-xs uppercase text-white dark:bg-gray-700">
                      <tr>
                        <th scope="col" className="px-6 py-3">
                          Time
                        </th>
                        <th scope="col" className="px-6 py-3">
                          Amount
                        </th>
                        <th scope="col" className="px-6 py-3">
                          Address
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-transparent">
                      <tr className="border-b dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-600">
                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-medium text-white dark:text-white">
                          2024-01-10T11:30:07
                        </th>
                        <td className="px-6 py-4">15</td>
                        <td className="px-6 py-4">0x03...4321</td>
                      </tr>
                      <tr className="border-b dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-600">
                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-medium text-white dark:text-white">
                          2024-01-10T11:30:07
                        </th>
                        <td className="px-6 py-4">15</td>
                        <td className="px-6 py-4">0x03...4321</td>
                      </tr>
                      <tr className="dark:bg-gray-800 dark:hover:bg-gray-600">
                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-medium text-white dark:text-white">
                          2024-01-10T11:30:07
                        </th>
                        <td className="px-6 py-4">15</td>
                        <td className="px-6 py-4">0x03...4321</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex h-[100px] w-full items-center justify-center bg-blue-950/40 backdrop-blur-sm">
        <div className="flex h-[45px] w-[90%] items-center justify-center text-white">
          Distribution Address: {ContractAddress}
        </div>
      </div>
    </div>
  )
}
