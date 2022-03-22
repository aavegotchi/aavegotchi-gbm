//import { BytesLike, ethers } from "ethers";

import { BigNumber, Signer } from "ethers";
import { BytesLike, parseEther, solidityKeccak256 } from "ethers/lib/utils";
//@ts-ignore
import { ethers, network } from "hardhat";
//import { network } from "hardhat";
import * as dotenv from "dotenv";

//import {deployDiamond} from "../tasks/"
import { expect } from "chai";
import { maticDiamondAddress } from "../scripts/helperFunctions";
import { deployUpgrade } from "../scripts/upgrades/upgrade-secondaryMarkets";
import {
  ERC1155Generic,
  ERC20Generic,
  ERC721Generic,
  GBMFacet,
  OwnershipFacet,
  SettingsFacet,
} from "../typechain";

dotenv.config({ path: __dirname + "/.env" });

//import hardhat, { run, ethers } from "hardhat";

async function prank(address: string) {
  //@ts-ignore
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
}
async function stopPrank(address: string) {
  //@ts-ignore
  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [address],
  });
}
//@ts-ignore
const key: string = process.env.SECRET_2;
let backendSigner = new ethers.Wallet(key);

async function constructSig(
  bidder: string,
  auctionID: string,
  bidAmount: BigNumber,
  lastHighestBid: string | BigNumber
) {
  const messageHash = ethers.utils.solidityKeccak256(
    ["address", "uint256", "uint256", "uint256"],
    [bidder, auctionID, bidAmount, lastHighestBid]
  );
  const signedMessage = await backendSigner.signMessage(
    ethers.utils.arrayify(messageHash)
  );
  const Sig = ethers.utils.arrayify(signedMessage);
  return Sig;
}

async function toSigner(address: string) {
  const genericSigner = await ethers.getSigner(address);
  return genericSigner;
}
let ownerSigner: Signer;
let gbmFacet: GBMFacet;
let ghst: ERC20Generic;
let erc1155: ERC1155Generic;
let erc721: ERC721Generic;
let owner: string;
let erc1155auctionId1: string;
let erc1155auctionId2: string;
let erc721auctionId1: string;
let erc721auctionId2: string;

let currentHighestBid;
const erc1155ContractID = 1010;
const erc721ContractID = 1111;
const pubkey: BytesLike =
  "0x718930fee804b7750072037bd966235a7b7af8e63b315d02e1d58de1b8522316b630c93cd9eeba1f7fd46fdabbdf102260b80e8e42cb28c73ab0ba66a9f3de6f";
const erc1155typeID: BytesLike = "0x973bb640";
const erc721typeID: BytesLike = "0x73ad2146";
const bidder1 = "0x08f4d97dd326094b66cc5eb597f288c5b5567fcf";
const bidder2 = "0xbd3183e633ca6c5065a8a4693923b3cde9e5175f";
const bidder3 = "0x3201dd0a33187968c134e55a925b69ce0fdeba22";
const ghstAddress = "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7";
const auctionOwner = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
let correctSig;
let nftSig1;

//Auction Preset params
let startTime = Math.floor(Date.now() / 1000) - 1000;
let endTime = Math.floor(Date.now() / 1000) + 86400;
let endTime2 = Math.floor(Date.now() / 1000) + 259200;
let hammerTimeDuration = 300;
let bidDecimals = 100000;
let stepMin = 10000;
let incMax = 10000;
let incMin = 1000;
let bidMultiplier = 11120;
const firstBid = ethers.utils.parseEther("100");
const secondBid = ethers.utils.parseEther("1000");
const thirdBid = ethers.utils.parseEther("5000");

describe("Test ERC1155 and ERC721 GBM Secondary ", async function () {
  this.timeout(300000);
  //@ts-ignore
  before(async function () {
    await network.provider.send("hardhat_setBalance", [
      bidder1,
      "0x1000000000000000000000000000",
    ]);

    console.log("upgrading");
    await deployUpgrade();

    //deploy sample ERC1155
    const mockErc1155 = await ethers.getContractFactory("ERC1155Generic");
    erc1155 = (await mockErc1155.deploy()) as ERC1155Generic;
    await erc1155.deployed();

    //deploy sample ERC721
    const mockErc721 = await ethers.getContractFactory("ERC721Generic");
    erc721 = (await mockErc721.deploy()) as ERC721Generic;
    await erc721.deployed();

    //mint 3 different erc1155 tokens
    await erc1155["mint(uint256,uint256)"](0, 2);
    await erc1155["mint(uint256,uint256)"](1, 2);
    await erc1155["mint(uint256,uint256)"](2, 2);

    //mint 2 different erc721 tokens
    await erc721["mint()"]();
    await erc721["mint()"]();

    const ownershipFacet = (await ethers.getContractAt(
      "OwnershipFacet",
      maticDiamondAddress
    )) as OwnershipFacet;
    gbmFacet = (await ethers.getContractAt(
      "GBMFacet",
      maticDiamondAddress
    )) as GBMFacet;

    ghst = (await ethers.getContractAt(
      "ERC20Generic",
      ghstAddress
    )) as ERC20Generic;

    owner = await ownershipFacet.owner();
    ownerSigner = await ethers.getSigner(owner);
    //approve diamond to transfer tokens
    await erc1155.setApprovalForAll(maticDiamondAddress, true);
    await erc721.setApprovalForAll(maticDiamondAddress, true);

    //change backendSigner
    const settingsFacet = (await ethers.getContractAt(
      "SettingsFacet",
      maticDiamondAddress
    )) as SettingsFacet;
    await settingsFacet.connect(ownerSigner).setBackendPubKey(pubkey);

    //set a new auction preset(used for first auction)

    await gbmFacet
      .connect(ownerSigner)
      .setAuctionPresets(
        111,
        startTime,
        endTime,
        hammerTimeDuration,
        bidDecimals,
        stepMin,
        incMin,
        incMax,
        bidMultiplier
      );
    //set another another auction preset(used for second auction)
    await gbmFacet
      .connect(ownerSigner)
      .setAuctionPresets(
        112,
        startTime,
        endTime2,
        hammerTimeDuration,
        bidDecimals,
        stepMin,
        incMin,
        incMax,
        bidMultiplier
      );
  });

  ///ERC1155
  ///ERC721
  it("Can create secondary markets for different tokenIds of the same token contract", async function () {
    //register auction token address for erc1155 and erc721
    await prank(owner);
    await gbmFacet
      .connect(ownerSigner)
      .secondaryMarketTokenContract(erc1155ContractID, erc1155.address);
    await gbmFacet
      .connect(ownerSigner)
      .secondaryMarketTokenContract(erc721ContractID, erc721.address);

    //try to auction incorrect/ amount of erc1155 tokens
    await expect(
      gbmFacet.registerAnAuctionTokenSecondaryMarket(
        erc1155ContractID,
        0,
        erc1155typeID,
        20,
        111
      )
    ).to.reverted;

    //try to auction incorrect id of erc721 token
    await expect(
      gbmFacet.registerAnAuctionTokenSecondaryMarket(
        erc721ContractID,
        10,
        erc721typeID,
        0,
        111
      )
    ).to.reverted;

    //set bidding allowed contract wide
    await gbmFacet
      .connect(ownerSigner)
      .setBiddingAllowed(erc1155.address, true);
    await gbmFacet.connect(ownerSigner).setBiddingAllowed(erc721.address, true);

    //make sure only token owner can create auction
    await expect(
      gbmFacet
        .connect(ownerSigner)
        .registerAnAuctionTokenSecondaryMarket(
          erc1155ContractID,
          0,
          erc1155typeID,
          2,
          111
        )
    ).to.revertedWith(
      "registerAnAuctionToken:  the specified ERC-1155 token cannot be auctionned"
    );

    await expect(
      gbmFacet
        .connect(ownerSigner)
        .registerAnAuctionTokenSecondaryMarket(
          erc721ContractID,
          0,
          erc721typeID,
          0,
          111
        )
    ).to.revertedWith(
      "registerAnAuctionToken: the specified ERC-721 token cannot be auctioned"
    );

    //register auction tokens for secondary market
    //use default auctionPreset
    const tx = await gbmFacet.registerAnAuctionTokenSecondaryMarket(
      erc1155ContractID,
      0,
      erc1155typeID,
      2,
      111
    );
    const txResolved = await tx.wait();
    //@ts-ignore
    erc1155auctionId1 = txResolved.events[0].args[0].toString();

    //try to register the same token with same id
    await expect(
      gbmFacet.registerAnAuctionTokenSecondaryMarket(
        erc1155ContractID,
        0,
        erc1155typeID,
        2,
        0
      )
    ).to.revertedWith("The auction already exist for the specified token");

    //creating second erc1155 auction
    //use first preset
    const tx2 = await gbmFacet.registerAnAuctionTokenSecondaryMarket(
      erc1155ContractID,
      1,
      erc1155typeID,
      2,
      112
    );

    const txResolved2 = await tx2.wait();
    //@ts-ignore
    erc1155auctionId2 = txResolved2.events[0].args[0];

    //creating first erc721 auction
    //use second preset
    const tx3 = await gbmFacet.registerAnAuctionTokenSecondaryMarket(
      erc721ContractID,
      0,
      erc721typeID,
      1,
      111
    );

    const txResolved3 = await tx3.wait();
    //@ts-ignore
    erc721auctionId1 = txResolved3.events[0].args[0];

    const tx4 = await gbmFacet.registerAnAuctionTokenSecondaryMarket(
      erc721ContractID,
      1,
      erc721typeID,
      1,
      112
    );

    const txResolved4 = await tx4.wait();
    //@ts-ignore
    erc721auctionId2 = txResolved4.events[0].args[0];

    //cannot auction a token already in an auction
    await expect(
      gbmFacet.registerAnAuctionTokenSecondaryMarket(
        erc721ContractID,
        1,
        erc721typeID,
        1,
        111
      )
    ).to.be.reverted;
  });

  it("Can bid on open secondary auctions,do incentive calculations ", async function () {
    ///BIDDING//
    await prank(bidder1);

    //all bidders approve first

    await ghst
      .connect(await toSigner(bidder1))
      .approve(maticDiamondAddress, ethers.utils.parseEther("1000000"));
    await prank(bidder2);
    await ghst
      .connect(await toSigner(bidder2))
      .approve(maticDiamondAddress, ethers.utils.parseEther("1000000"));
    await prank(bidder3);
    await ghst
      .connect(await toSigner(bidder3))
      .approve(maticDiamondAddress, ethers.utils.parseEther("1000000"));
    //transfer some ghst to auction owner
    await ghst
      .connect(await toSigner(bidder3))
      .transfer(auctionOwner, ethers.utils.parseEther("1000"));
    await prank(owner);

    correctSig = await constructSig(bidder1, erc1155auctionId1, firstBid, "0");
    nftSig1 = await constructSig(bidder1, erc721auctionId1, firstBid, "0");

    //bidder1 bids 100ghst on both auctions

    expect(
      await gbmFacet
        .connect(await toSigner(bidder1))
        .commitBid(erc1155auctionId1, "0", "0", correctSig)
    ).to.revertedWith("bid: _bidAmount cannot be 0");

    await gbmFacet
      .connect(await toSigner(bidder1))
      .commitBid(erc1155auctionId1, firstBid, 0, correctSig);

    await gbmFacet
      .connect(await toSigner(bidder1))
      .commitBid(erc721auctionId1, firstBid, 0, nftSig1);

    let correctSig2 = await constructSig(
      bidder1,
      erc1155auctionId2,
      firstBid,
      "0"
    );

    await gbmFacet
      .connect(await toSigner(bidder1))
      .commitBid(erc1155auctionId2, firstBid, 0, correctSig2);

    correctSig = await constructSig(
      bidder2,
      erc1155auctionId1,
      firstBid,
      firstBid
    );

    await prank(bidder2);
    //cannot bid lower or equal to the minimum bid
    await expect(
      gbmFacet
        .connect(await toSigner(bidder2))
        .commitBid(erc1155auctionId1, firstBid, firstBid, correctSig)
    ).to.revertedWith("bid: _bidAmount must be higher than _highestBid'");
    //get due incentives for bidder1
    let balBefore = await ghst.balanceOf(bidder1);
    let dueIncentives = await gbmFacet.getAuctionDueIncentives(
      erc1155auctionId1
    );
    //place bid normally
    //bidder2 bids 1000ghst
    correctSig = await constructSig(
      bidder2,
      erc1155auctionId1,
      secondBid,
      firstBid
    );

    await gbmFacet
      .connect(await toSigner(bidder2))
      .commitBid(erc1155auctionId1, secondBid, firstBid, correctSig);
    let balAfter = await ghst.balanceOf(bidder1);

    //bidder1 receives bid+incentive after being outbid
    expect(balAfter).to.equal(balBefore.add(firstBid).add(dueIncentives));

    dueIncentives = await gbmFacet.getAuctionDueIncentives(erc1155auctionId1);
    balBefore = await ghst.balanceOf(bidder2);
    await prank(bidder3);

    //bidder3 bids 5000ghst
    correctSig = await constructSig(
      bidder3,
      erc1155auctionId1,
      thirdBid,
      secondBid
    );

    await gbmFacet
      .connect(await toSigner(bidder3))
      .commitBid(erc1155auctionId1, thirdBid, secondBid, correctSig);
    balAfter = await ghst.balanceOf(bidder2);
    expect(balAfter).to.equal(balBefore.add(secondBid).add(dueIncentives));
  });

  it("can claim NFT", async function () {
    ethers.provider.send("evm_increaseTime", [87410]);
    ethers.provider.send("evm_mine", []);
    await (
      await gbmFacet.connect(await toSigner(bidder3)).claim(erc1155auctionId1)
    ).wait();

    const bal = await erc1155.balanceOf(bidder3, 0);
    expect(bal).to.equal(2);

    //NO LOGIC IN CONTRACT TO SEND OWNER REWARDS TO HIM
    // //confirm that auction owner receives his reward
    // console.log("the current balance is", await ghst.balanceOf(auctionOwner));
    // expect(await ghst.balanceOf(auctionOwner))
  });

  it("cancels unclaimed auctions in their grace period", async function () {
    //only owner can cancel his auction
    await expect(
      gbmFacet.connect(ownerSigner).cancelAuction(erc1155auctionId1)
    ).to.revertedWith("NotAuctionOwner()");
    await stopPrank(bidder3);
    // await expect(
    //   gbmFacet.cancelAuction(erc1155auctionId1)
    // ).to.revertedWith("claim: this auction has already been claimed");
    //cannot cancel a claimed auction
    await expect(gbmFacet.cancelAuction(erc1155auctionId1)).to.revertedWith(
      "claim: this auction has already been claimed"
    );

    // await gbmFacet.cancelAuction(erc1155auctionId2);
  });
});
