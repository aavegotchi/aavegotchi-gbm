// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {LibDiamond} from "./LibDiamond.sol";

//Struct used to store the representation of an NFT being auctionned
struct TokenRepresentation {
    address contractAddress; // The contract address
    uint256 tokenId; // The ID of the token on the contract
    bytes4 tokenKind; // The ERC name of the token implementation bytes4(keccak256("ERC721")) or bytes4(keccak256("ERC1155"))
    uint256 tokenAmount; // The amount of units that are sold in the auction
}

struct ContractAddresses {
    address pixelcraft;
    address playerRewards;
    address daoTreasury;
    address erc20Currency;
}

struct InitiatorInfo {
    uint256 startTime;
    uint256 endTime;
    uint256 hammerTimeDuration;
    uint256 bidDecimals;
    uint256 stepMin;
    uint256 incMin;
    uint256 incMax;
    uint256 bidMultiplier;
}

struct Auction {
    address owner;
    address highestBidder;
    uint256 highestBid;
    uint256 auctionDebt;
    uint256 dueIncentives;
    address contractAddress;
    uint256 startTime;
    uint256 endTime;
    uint256 hammerTimeDuration;
    uint256 bidDecimals;
    uint256 stepMin;
    uint256 incMin;
    uint256 incMax;
    uint256 bidMultiplier;
    bool biddingAllowed;
}

struct Collection {
    uint256 startTime;
    uint256 endTime;
    uint256 hammerTimeDuration;
    uint256 bidDecimals;
    uint256 stepMin;
    uint256 incMin; // minimal earned incentives
    uint256 incMax; // maximal earned incentives
    uint256 bidMultiplier; // bid incentive growth multiplier
    bool biddingAllowed; // Allow to start/pause ongoing auctions
    uint256 duration;
}

struct AppStorage {
    address pixelcraft;
    address playerRewards;
    address daoTreasury;
    InitiatorInfo initiatorInfo;
    //Contract address storing the ERC20 currency used in auctions
    address erc20Currency;
    mapping(uint256 => TokenRepresentation) tokenMapping; //_auctionId => token_primaryKey

    //DEPRECATED DUE TO DUAL TOKEN ID SAME CONTRACT
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) auctionMapping; // contractAddress => tokenId => TokenIndex => _auctionId  

    //var storing individual auction settings. if != null, they take priority over collection settings
    mapping(uint256 => Auction) auctions; //_auctionId => auctions
    mapping(uint256 => bool) auctionItemClaimed;
    //var storing contract wide settings. Those are used if no auctionId specific parameters is initialized
    mapping(address => Collection) collections; //tokencontract => collections
    mapping(address => mapping(uint256 => uint256)) erc1155TokensIndex; //Contract => TokenID => Amount being auctionned
    mapping(address => mapping(uint256 => uint256)) erc1155TokensUnderAuction; //Contract => TokenID => Amount being auctionned
    bytes backendPubKey;

    //Secondary market patch
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) auction721Mapping; // contractAddress => tokenId => TokenIndex => _auctionId 
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) auction1155Mapping; // contractAddress => tokenId => TokenIndex => _auctionId 
    mapping(address => mapping(uint256 => uint256)) erc721TokensIndex; //Contract => TokenID => Iteration of being auctionned
    mapping(uint256 => address) auctionSeller; //auctionID => Auction seller Mapping storing who is the seller of a token for a specific auction. 
    mapping(uint256 => Collection) auctionPresets; // presestID => Configuration parameters collection
    mapping(uint256 => address) secondaryMarketTokenContract; //tokenContractId => Token contract address
}

contract Modifiers {
    AppStorage internal s;

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }
}
