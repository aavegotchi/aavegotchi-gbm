// SPDX-License-Identifier: UNLICENSED
// © Copyright 2021. Patent pending. All rights reserved. Perpetual Altruism Ltd.
pragma solidity ^0.8.0;

import "../interfaces/IGBM.sol";
import "../interfaces/IGBMInitiator.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/IERC721TokenReceiver.sol";
import "../interfaces/IERC1155.sol";
import "../interfaces/IERC1155TokenReceiver.sol";
import "../interfaces/Ownable.sol";
import "../libraries/AppStorage.sol";
import "../libraries/LibDiamond.sol";
import "../libraries/LibSignature.sol";

/// @title GBM auction contract
/// @dev See GBM.auction on how to use this contract
/// @author Guillaume Gonnaud
contract GBMFacet is IGBM, IERC1155TokenReceiver, IERC721TokenReceiver, Modifiers {
    function erc20Currency() external view override returns (address) {
        return s.erc20Currency;
    }

    /// @notice Place a GBM bid for a GBM auction
    /// @param _auctionId The auction you want to bid on
    /// @param _bidAmount The amount of the ERC20 token the bid is made of. They should be withdrawable by this contract.
    /// @param _highestBid The current higest bid. Throw if incorrect.
    /// @param _signature Signature
    function commitBid(
        uint256 _auctionId,
        uint256 _bidAmount,
        uint256 _highestBid,
        bytes memory _signature
    ) external {
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _auctionId, _bidAmount, _highestBid));
        require(LibSignature.isValid(messageHash, _signature, s.backendPubKey), "bid: Invalid signature");

        bid(_auctionId, _bidAmount, _highestBid);
    }

    /// @notice Place a GBM bid for a GBM auction
    /// @param _auctionId The auction you want to bid on
    /// @param _bidAmount The amount of the ERC20 token the bid is made of. They should be withdrawable by this contract.
    /// @param _highestBid The current higest bid. Throw if incorrect.
    function bid(
        uint256 _auctionId,
        uint256 _bidAmount,
        uint256 _highestBid
    ) internal {
        require(s.collections[s.tokenMapping[_auctionId].contractAddress].biddingAllowed, "bid: bidding is currently not allowed");

        require(_bidAmount > 1, "bid: _bidAmount cannot be 0");

        require(_highestBid == s.auctions[_auctionId].highestBid, "bid: current highest bid does not match the submitted transaction _highestBid");

        //An auction start time of 0 also indicate the auction has not been created at all

        require(getAuctionStartTime(_auctionId) <= block.timestamp && getAuctionStartTime(_auctionId) != 0, "bid: Auction has not started yet");
        require(getAuctionEndTime(_auctionId) >= block.timestamp, "bid: Auction has already ended");

        require(_bidAmount > _highestBid, "bid: _bidAmount must be higher than _highestBid");

        require(
            // (_highestBid * (getAuctionBidDecimals(_auctionId)) + (getAuctionStepMin(_auctionId) / getAuctionBidDecimals(_auctionId))) >= _highestBid,
            // "bid: _bidAmount must meet the minimum bid"

            (_highestBid * (getAuctionBidDecimals(_auctionId) + getAuctionStepMin(_auctionId))) <= (_bidAmount * getAuctionBidDecimals(_auctionId)),
            "bid: _bidAmount must meet the minimum bid"
        );

        //Transfer the money of the bidder to the GBM smart contract
        IERC20(s.erc20Currency).transferFrom(msg.sender, address(this), _bidAmount);

        //Extend the duration time of the auction if we are close to the end
        if (getAuctionEndTime(_auctionId) < block.timestamp + getAuctionHammerTimeDuration(_auctionId)) {
            s.auctions[_auctionId].endTime = block.timestamp + getAuctionHammerTimeDuration(_auctionId);
            emit Auction_EndTimeUpdated(_auctionId, s.auctions[_auctionId].endTime);
        }

        // Saving incentives for later sending
        uint256 duePay = s.auctions[_auctionId].dueIncentives;
        address previousHighestBidder = s.auctions[_auctionId].highestBidder;
        uint256 previousHighestBid = s.auctions[_auctionId].highestBid;

        // Emitting the event sequence
        if (previousHighestBidder != address(0)) {
            emit Auction_BidRemoved(_auctionId, previousHighestBidder, previousHighestBid);
        }

        if (duePay != 0) {
            s.auctions[_auctionId].auctionDebt = s.auctions[_auctionId].auctionDebt + duePay;
            emit Auction_IncentivePaid(_auctionId, previousHighestBidder, duePay);
        }

        emit Auction_BidPlaced(_auctionId, msg.sender, _bidAmount);

        // Calculating incentives for the new bidder
        s.auctions[_auctionId].dueIncentives = calculateIncentives(_auctionId, _bidAmount);

        //Setting the new bid/bidder as the highest bid/bidder
        s.auctions[_auctionId].highestBidder = msg.sender;
        s.auctions[_auctionId].highestBid = _bidAmount;

        if ((previousHighestBid + duePay) != 0) {
            //Refunding the previous bid as well as sending the incentives

            //Added to prevent revert
            IERC20(s.erc20Currency).approve(address(this), (previousHighestBid + duePay));

            IERC20(s.erc20Currency).transferFrom(address(this), previousHighestBidder, (previousHighestBid + duePay));
        }
    }

    function batchClaim(uint256[] memory _auctionIds) external override {
        for (uint256 index = 0; index < _auctionIds.length; index++) {
            claim(_auctionIds[index]);
        }
    }

    function updatePlayerRewardsAddress(address _newAddress) external onlyOwner {
        s.playerRewards = _newAddress;
    }

    /// @notice Attribute a token to the winner of the auction and distribute the proceeds to the owner of this contract.
    /// throw if bidding is disabled or if the auction is not finished.
    /// @param _auctionId The auctionId of the auction to complete
    function claim(uint256 _auctionId) public override {
        address _ca = s.tokenMapping[_auctionId].contractAddress;
        uint256 _tid = s.tokenMapping[_auctionId].tokenId;
        uint256 _tam = s.tokenMapping[_auctionId].tokenAmount;

        require(_ca != address(0x0), "claim: Auction does not exist");
        require(s.collections[_ca].biddingAllowed, "claim: Claiming is currently not allowed");
		if(s.auctionSeller[_auctionId] == address(0x0)){ //If it's a primary auction
			require(getAuctionEndTime(_auctionId) < block.timestamp, "claim: Auction has not yet ended");
		} else { //If It's a secondary market auction
			require(getAuctionEndTime(_auctionId) + getAuctionHammerTimeDuration(_auctionId) < block.timestamp, "claim: Auction has not yet ended"); //Accomodating for the cancellation period
		}
        require(s.auctionItemClaimed[_auctionId] == false, "claim: Item has already been claimed");

        //Prevents re-entrancy
        s.auctionItemClaimed[_auctionId] = true;

        //Todo: Add in the various Aavegotchi addresses
        uint256 _proceeds = s.auctions[_auctionId].highestBid - s.auctions[_auctionId].auctionDebt;

        //Added to prevent revert
        IERC20(s.erc20Currency).approve(address(this), _proceeds);

        //Transfer the proceeds to the various recipients

        //5% to burn address
        uint256 burnShare = (_proceeds * 5) / 100;

        //40% to Pixelcraft wallet
        uint256 companyShare = (_proceeds * 40) / 100;

        //40% to player rewards
        uint256 playerRewardsShare = (_proceeds * 2) / 5;

        //15% to DAO
        uint256 daoShare = (_proceeds - burnShare - companyShare - playerRewardsShare);

        IERC20(s.erc20Currency).transferFrom(address(this), address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF), burnShare);
        IERC20(s.erc20Currency).transferFrom(address(this), s.pixelcraft, companyShare);
        IERC20(s.erc20Currency).transferFrom(address(this), s.playerRewards, playerRewardsShare);
        IERC20(s.erc20Currency).transferFrom(address(this), s.daoTreasury, daoShare);

        //todo: test
        if (s.auctions[_auctionId].highestBid == 0) {
            s.auctions[_auctionId].highestBidder = LibDiamond.contractOwner();
        }

        if (s.tokenMapping[_auctionId].tokenKind == bytes4(keccak256("ERC721"))) {
            //0x73ad2146
            IERC721(_ca).safeTransferFrom(address(this), s.auctions[_auctionId].highestBidder, _tid);
        } else if (s.tokenMapping[_auctionId].tokenKind == bytes4(keccak256("ERC1155"))) {
            //0x973bb640
            IERC1155(_ca).safeTransferFrom(address(this), s.auctions[_auctionId].highestBidder, _tid, _tam, "");
            s.erc1155TokensUnderAuction[_ca][_tid] = s.erc1155TokensUnderAuction[_ca][_tid] - _tam;
        }

        emit Auction_ItemClaimed(_auctionId);
    }

    /// @notice Register an auction contract default parameters for a GBM auction. To use to save gas
    /// @param _contract The token contract the auctionned token belong to
    function registerAnAuctionContract(address _contract) public onlyOwner {
        s.collections[_contract].startTime = s.initiatorInfo.startTime;
        s.collections[_contract].endTime = s.initiatorInfo.endTime;
        s.collections[_contract].hammerTimeDuration = s.initiatorInfo.hammerTimeDuration;
        s.collections[_contract].bidDecimals = s.initiatorInfo.bidDecimals;
        s.collections[_contract].stepMin = s.initiatorInfo.stepMin;
        s.collections[_contract].incMin = s.initiatorInfo.incMin;
        s.collections[_contract].incMax = s.initiatorInfo.incMax;
        s.collections[_contract].bidMultiplier = s.initiatorInfo.bidMultiplier;
    }

    /// @notice Allow/disallow bidding and claiming for a whole token contract address.
    /// @param _contract The token contract the auctionned token belong to
    /// @param _value True if bidding/claiming should be allowed.
    function setBiddingAllowed(address _contract, bool _value) external onlyOwner {
        s.collections[_contract].biddingAllowed = _value;
        emit Contract_BiddingAllowed(_contract, _value);
    }

    /// @notice Register an auction token and emit the relevant AuctionInitialized & AuctionStartTimeUpdated events
    /// Throw if the token owner is not the GBM smart contract/supply of auctionned 1155 token is insufficient
    /// @param _tokenContract The token contract the auctionned token belong to
    /// @param _tokenId The token ID of the token being auctionned
    /// @param _tokenKind either bytes4(keccak256("ERC721")) or bytes4(keccak256("ERC1155"))
    /// @param _useInitiator Set to `false` if you want to use the default value registered for the token contract (if wanting to reset to default,
    /// use `true`)
    function registerAnAuctionToken(
        address _tokenContract,
        uint256 _tokenId,
        bytes4 _tokenKind,
        bool _useInitiator
    ) public onlyOwner {
        modifyAnAuctionToken(_tokenContract, _tokenId, _tokenKind, _useInitiator, 0, 0, 1, 0, 0);
    }
	
	/// @notice Register an auction token and emit the relevant AuctionInitialized & AuctionStartTimeUpdated events
    /// Throw if the token owner is not the GBM smart contract/supply of auctionned 1155 token is insufficient
    /// @param _contractID Id of the token contract the auctionned token belong to
    /// @param _tokenId The token ID of the token being auctionned
    /// @param _tokenKind either bytes4(keccak256("ERC721")) or bytes4(keccak256("ERC1155"))
    /// @param _auctionPresetID Choosen preset for the auction
    function registerAnAuctionTokenSecondaryMarket(
        uint256 _contractID,
        uint256 _tokenId,
        bytes4 _tokenKind,
        uint256 _tokenAmount,
        uint256 _auctionPresetID,
        uint256 _auctionStartTime
    ) public {
        address _tokenContract = s.secundaryMarketTokenContract[_contractID];
        require(_tokenContract != address(0), "ContractID does not exist");
        require(_auctionStartTime > block.timestamp, "Start time in the past");
        require(s.auctionPresets[_auctionPresetID].duration != 0, "Preset parameters are not correct");
		if (_tokenKind == bytes4(keccak256("ERC721"))){
            IERC721(_tokenContract).safeTransferFrom(msg.sender, address(this), _tokenId);
		} else {
            IERC1155(_tokenContract).safeTransferFrom(msg.sender, address(this), _tokenId, _tokenAmount, "");
		}
        modifyAnAuctionToken(_tokenContract, _tokenId, _tokenKind, false, 0, 0, _tokenAmount, _auctionPresetID, _auctionStartTime);
    }

	/// @notice Register a token contract to be use in the secundary market
    /// Throw if the token owner is not the GBM smart contract
    /// @param _contractID Id of the token contract the auctionned token belong to
    /// @param _tokenContract The token contract the auctionned token belong to
    function secundaryMarketTokenContract(uint256 _contractID, address _tokenContract) external onlyOwner {
        s.secundaryMarketTokenContract[_contractID] = _tokenContract;
    }

    /// @notice Register an auction token and emit the relevant AuctionInitialized & AuctionStartTimeUpdated events
    /// Throw if the token owner is not the GBM smart contract/supply of auctionned 1155 token is insufficient
    /// @param _tokenContract The token contract the auctionned token belong to
    /// @param _tokenId The token ID of the token being auctionned
    /// @param _tokenKind either bytes4(keccak256("ERC721")) or bytes4(keccak256("ERC1155"))
    /// @param _useInitiator Set to `false` if you want to use the default value registered for the token contract (if wanting to reset to default,
    /// use `true`)
    /// @param _index Set to 0 if dealing with a registration. Set to desired auction index if you want to reinitialize
    /// @param _rewriteBlock Set to 0 if you want to register a new auction, to the blocknumber of a past registered auction if you want to edit it
    /// @param _tokenAmount Amount of units of the token that are going to sold in the auction
    /// @param _auctionPresetID Choosen preset for the auction
    function modifyAnAuctionToken(
        address _tokenContract,
        uint256 _tokenId,
        bytes4 _tokenKind,
        bool _useInitiator,
        uint256 _index,
        uint256 _rewriteBlock,
        uint256 _tokenAmount,
        uint256 _auctionPresetID,
        uint256 _auctionStartTime
    ) internal {

		uint256 _locIndex;
		
        if (_rewriteBlock != 0) { //Case where we are rewriting an auction
            if (_tokenKind == bytes4(keccak256("ERC721"))) {
                require(s.auction721Mapping[_tokenContract][_tokenId][_index] != 0, "The auction doesn't exist for the specified parameters");
            } else {
                require(s.auction1155Mapping[_tokenContract][_tokenId][_index] != 0, "The auction doesn't exist for the specified parameters");
            }
			_locIndex = _index;
	
        } else { //Case we are registering an auction
			if (_tokenKind == bytes4(keccak256("ERC721"))) {
				_locIndex = s.erc721TokensIndex[_tokenContract][_tokenId];
				require(s.auction721Mapping[_tokenContract][_tokenId][_locIndex] == 0, "The auction already exist for the specified token");
            } else {
				_locIndex = s.erc1155TokensIndex[_tokenContract][_tokenId];
                require(s.auction1155Mapping[_tokenContract][_tokenId][_locIndex] == 0, "The auction already exist for the specified token");
            }
        }

        //Checking the kind of token being registered
        require(
            _tokenKind == bytes4(keccak256("ERC721")) || _tokenKind == bytes4(keccak256("ERC1155")),
            "registerAnAuctionToken: Only ERC1155 and ERC721 tokens are supported"
        );

        //Building the auction object
        TokenRepresentation memory newAuction;
        newAuction.contractAddress = _tokenContract;
        newAuction.tokenId = _tokenId;
        newAuction.tokenKind = _tokenKind;
        newAuction.tokenAmount = _tokenAmount;

        uint256 _auctionId;

        if (_tokenKind == bytes4(keccak256("ERC721"))) {
            require(
                msg.sender == Ownable(_tokenContract).owner() || address(this) == IERC721(_tokenContract).ownerOf(_tokenId),
                "registerAnAuctionToken: the specified ERC-721 token cannot be auctioned"
            );
    
            if(_rewriteBlock == 0){
                _auctionId = uint256(keccak256(abi.encodePacked(_tokenContract, _tokenId, _tokenKind, block.number)));
            } else {
                _auctionId = uint256(keccak256(abi.encodePacked(_tokenContract, _tokenId, _tokenKind, _rewriteBlock)));
            }
			uint256 _721Index = s.erc721TokensIndex[_tokenContract][_tokenId];
			
            s.auction721Mapping[_tokenContract][_tokenId][_721Index] = _auctionId;
            s.erc721TokensIndex[_tokenContract][_tokenId] = _721Index + 1;

        } else {
            require(
                msg.sender == Ownable(_tokenContract).owner() ||
                    (s.erc1155TokensUnderAuction[_tokenContract][_tokenId] + _tokenAmount) <= IERC1155(_tokenContract).balanceOf(address(this), _tokenId),
                "registerAnAuctionToken:  the specified ERC-1155 token cannot be auctionned"
            );

            require(
                _locIndex <= s.erc1155TokensIndex[_tokenContract][_tokenId],
                "The specified _locIndex have not been reached yet for this token"
            );

            if(_rewriteBlock == 0){
                _auctionId = uint256(keccak256(abi.encodePacked(_tokenContract, _tokenId, _tokenKind, _locIndex, block.number)));
                s.erc1155TokensIndex[_tokenContract][_tokenId] = s.erc1155TokensIndex[_tokenContract][_tokenId] + 1;
                s.erc1155TokensUnderAuction[_tokenContract][_tokenId] = s.erc1155TokensUnderAuction[_tokenContract][_tokenId] + _tokenAmount;
            } else {
                _auctionId = uint256(keccak256(abi.encodePacked(_tokenContract, _tokenId, _tokenKind, _locIndex, _rewriteBlock)));
            }

            s.auction1155Mapping[_tokenContract][_tokenId][_locIndex] = _auctionId;
        }

        s.tokenMapping[_auctionId] = newAuction;

        if (_useInitiator) {
            s.auctions[_auctionId].owner = LibDiamond.contractOwner();
            s.auctions[_auctionId].startTime = s.initiatorInfo.startTime;
            s.auctions[_auctionId].endTime = s.initiatorInfo.endTime;
            s.auctions[_auctionId].hammerTimeDuration = s.initiatorInfo.hammerTimeDuration;
            s.auctions[_auctionId].bidDecimals = s.initiatorInfo.bidDecimals;
            s.auctions[_auctionId].stepMin = s.initiatorInfo.stepMin;
            s.auctions[_auctionId].incMin = s.initiatorInfo.incMin;
            s.auctions[_auctionId].incMax = s.initiatorInfo.incMax;
            s.auctions[_auctionId].bidMultiplier = s.initiatorInfo.bidMultiplier;
        }

        if (_auctionPresetID != 0) {            
            s.auctions[_auctionId].owner = LibDiamond.contractOwner();
            s.auctions[_auctionId].startTime = _auctionStartTime;
            s.auctions[_auctionId].endTime = _auctionStartTime + s.auctionPresets[_auctionPresetID].duration;
            s.auctions[_auctionId].hammerTimeDuration = s.auctionPresets[_auctionPresetID].hammerTimeDuration;
            s.auctions[_auctionId].bidDecimals = s.auctionPresets[_auctionPresetID].bidDecimals;
            s.auctions[_auctionId].stepMin = s.auctionPresets[_auctionPresetID].stepMin;
            s.auctions[_auctionId].incMin = s.auctionPresets[_auctionPresetID].incMin;
            s.auctions[_auctionId].incMax = s.auctionPresets[_auctionPresetID].incMax;
            s.auctions[_auctionId].bidMultiplier = s.auctionPresets[_auctionPresetID].bidMultiplier;

			s.auctionSeller[_auctionId] = msg.sender;
        }

        //Event emitted when an auction is being setup
        emit Auction_Initialized(_auctionId, _tokenId, _locIndex, _tokenContract, _tokenKind);

        //Event emitted when the start time of an auction changes (due to admin interaction )
        emit Auction_StartTimeUpdated(_auctionId, getAuctionStartTime(_auctionId));
    }

	/// @notice Seller can cancel an auction during the grace period 
    /// Throw if the token owner is not the caller of the function
    /// @param _auctionID The auctionId of the auction to complete
    function cancelAuction(uint256 _auctionID) public {
		require(s.auctionSeller[_auctionID] != address(0), "Initial auctions cannot be cancelled");
		
        address _ca = s.tokenMapping[_auctionID].contractAddress;
        uint256 _tid = s.tokenMapping[_auctionID].tokenId;
        uint256 _tam = s.tokenMapping[_auctionID].tokenAmount;
        
        require(s.collections[_ca].biddingAllowed, "claim: Claiming is currently not allowed");
        require(msg.sender == s.auctionSeller[_auctionID], "cancelAuction: Not the owner of the token");
        require(getAuctionEndTime(_auctionID) < block.timestamp, "cancelAuction: Auction has not yet ended");
        require(getAuctionEndTime(_auctionID) + getAuctionHammerTimeDuration(_auctionID) > block.timestamp, "cancelAuction: Cancellation time has already ended");
        
        require(!s.auctionItemClaimed[_auctionID], "claim: this auction has alredy been claimed");   
        s.auctionItemClaimed[_auctionID]  = true;

		uint256 _proceeds = s.auctions[_auctionID].highestBid - s.auctions[_auctionID].auctionDebt;
		
		//Send the debt + his due incentives from the seller to the highest bidder
		IERC20(s.erc20Currency).transferFrom(s.auctionSeller[_auctionID], s.auctions[_auctionID].highestBidder, s.auctions[_auctionID].dueIncentives + s.auctions[_auctionID].auctionDebt);

		//INSERT ANY EXTRA FEE HERE
		
		//Refund it's bid minus debt to the highest bidder
		IERC20(s.erc20Currency).transferFrom(address(this), s.auctions[_auctionID].highestBidder, _proceeds);

        // Transfer the token to the owner/canceller
        if (s.tokenMapping[_auctionID].tokenKind == bytes4(keccak256("ERC721"))){ //0x73ad2146
            IERC721(_ca).safeTransferFrom(address(this), s.auctionSeller[_tid], _tid);
        } else if (s.tokenMapping[_auctionID].tokenKind == bytes4(keccak256("ERC1155"))){ //0x973bb640
            IERC1155(_ca).safeTransferFrom(address(this), s.auctionSeller[_tid], _tid, _tam, "");
            s.erc1155TokensUnderAuction[_ca][_tid] = s.erc1155TokensUnderAuction[_ca][_tid] - _tam;
        }

        emit AuctionCancelled(_auctionID, _tid);
    }        

	/// @notice Register parameters of auction to be used as presets
    /// Throw if the token owner is not the GBM smart contract
    function setAuctionPresets(uint256 _auctionPresetID,
        uint256 _hammerTimeDuration,
        uint256 _bidDecimals,
        uint256 _stepMin,
        uint256 _incMin,
        uint256 _incMax,
        uint256 _bidMultiplier,
        uint256 _duration
    ) external onlyOwner {
        s.auctionPresets[_auctionPresetID].hammerTimeDuration = _hammerTimeDuration;
        s.auctionPresets[_auctionPresetID].bidDecimals = _bidDecimals;
        s.auctionPresets[_auctionPresetID].stepMin = _stepMin;
        s.auctionPresets[_auctionPresetID].incMin = _incMin;
        s.auctionPresets[_auctionPresetID].incMax = _incMax;
        s.auctionPresets[_auctionPresetID].bidMultiplier = _bidMultiplier;
        s.auctionPresets[_auctionPresetID].duration = _duration;
    }

    function getAuctionPresets(uint256 _auctionPresetID) public view returns(
        uint256 _hammerTimeDuration,
        uint256 _bidDecimals,
        uint256 _stepMin,
        uint256 _incMin,
        uint256 _incMax,
        uint256 _bidMultiplier,
        uint256 _duration)
    {
        _hammerTimeDuration = s.auctionPresets[_auctionPresetID].hammerTimeDuration;
        _bidDecimals = s.auctionPresets[_auctionPresetID].bidDecimals;
        _stepMin = s.auctionPresets[_auctionPresetID].stepMin;
        _incMin = s.auctionPresets[_auctionPresetID].incMin;
        _incMax = s.auctionPresets[_auctionPresetID].incMax;
        _bidMultiplier = s.auctionPresets[_auctionPresetID].bidMultiplier;
        _duration = s.auctionPresets[_auctionPresetID].duration;
    }

    function getAuctionInfo(uint256 _auctionId) external view returns (Auction memory auctionInfo_) {
        auctionInfo_ = s.auctions[_auctionId];
        auctionInfo_.contractAddress = s.tokenMapping[_auctionId].contractAddress;
        auctionInfo_.biddingAllowed = s.collections[s.tokenMapping[_auctionId].contractAddress].biddingAllowed;
    }

    function getAuctionHighestBidder(uint256 _auctionId) external view override returns (address) {
        return s.auctions[_auctionId].highestBidder;
    }

    function getAuctionHighestBid(uint256 _auctionId) external view override returns (uint256) {
        return s.auctions[_auctionId].highestBid;
    }

    function getAuctionDebt(uint256 _auctionId) external view override returns (uint256) {
        return s.auctions[_auctionId].auctionDebt;
    }

    function getAuctionDueIncentives(uint256 _auctionId) external view override returns (uint256) {
        return s.auctions[_auctionId].dueIncentives;
    }

	//Deprecated, will assume earliest auctionned token with old mapping
    function getAuctionID(address _contract, uint256 _tokenID) external view override returns (uint256) { 
        return s.auctionMapping[_contract][_tokenID][0];
    }

	//Deprecated, this function use the old mapping
    function getAuctionID(
        address _contract,
        uint256 _tokenID,
        uint256 _tokenIndex
    ) external view override returns (uint256) {
        return s.auctionMapping[_contract][_tokenID][_tokenIndex];
    }
	
	function getAuctionID(
		address _contract,
        uint256 _tokenID,
        uint256 _tokenIndex,
		bytes4 _tokenKind
    ) external view override returns (uint256) {
		if (_tokenKind == bytes4(keccak256("ERC721"))) {
			return s.auction721Mapping[_contract][_tokenID][_tokenIndex];
		} else {
			return s.auction1155Mapping[_contract][_tokenID][_tokenIndex];
		}
	}

    function getTokenKind(uint256 _auctionId) external view override returns (bytes4) {
        return s.tokenMapping[_auctionId].tokenKind;
    }

    function getTokenId(uint256 _auctionId) external view override returns (uint256) {
        return s.tokenMapping[_auctionId].tokenId;
    }

    function getContractAddress(uint256 _auctionId) external view override returns (address) {
        return s.tokenMapping[_auctionId].contractAddress;
    }

    function getAuctionStartTime(uint256 _auctionId) public view override returns (uint256) {
        if (s.auctions[_auctionId].startTime != 0) {
            return s.auctions[_auctionId].startTime;
        } else {
            return s.collections[s.tokenMapping[_auctionId].contractAddress].startTime;
        }
    }

    function getAuctionEndTime(uint256 _auctionId) public view override returns (uint256) {
        if (s.auctions[_auctionId].endTime != 0) {
            return s.auctions[_auctionId].endTime;
        } else {
            return s.collections[s.tokenMapping[_auctionId].contractAddress].endTime;
        }
    }

    function getAuctionHammerTimeDuration(uint256 _auctionId) public view override returns (uint256) {
        if (s.auctions[_auctionId].hammerTimeDuration != 0) {
            return s.auctions[_auctionId].hammerTimeDuration;
        } else {
            return s.collections[s.tokenMapping[_auctionId].contractAddress].hammerTimeDuration;
        }
    }

    function getAuctionBidDecimals(uint256 _auctionId) public view override returns (uint256) {
        if (s.auctions[_auctionId].bidDecimals != 0) {
            return s.auctions[_auctionId].bidDecimals;
        } else {
            return s.collections[s.tokenMapping[_auctionId].contractAddress].bidDecimals;
        }
    }

    function getAuctionStepMin(uint256 _auctionId) public view override returns (uint256) {
        if (s.auctions[_auctionId].stepMin != 0) {
            return s.auctions[_auctionId].stepMin;
        } else {
            return s.collections[s.tokenMapping[_auctionId].contractAddress].stepMin;
        }
    }

    function getAuctionIncMin(uint256 _auctionId) public view override returns (uint256) {
        if (s.auctions[_auctionId].incMin != 0) {
            return s.auctions[_auctionId].incMin;
        } else {
            return s.collections[s.tokenMapping[_auctionId].contractAddress].incMin;
        }
    }

    function getAuctionIncMax(uint256 _auctionId) public view override returns (uint256) {
        if (s.auctions[_auctionId].incMax != 0) {
            return s.auctions[_auctionId].incMax;
        } else {
            return s.collections[s.tokenMapping[_auctionId].contractAddress].incMax;
        }
    }

    function getAuctionBidMultiplier(uint256 _auctionId) public view override returns (uint256) {
        if (s.auctions[_auctionId].bidMultiplier != 0) {
            return s.auctions[_auctionId].bidMultiplier;
        } else {
            return s.collections[s.tokenMapping[_auctionId].contractAddress].bidMultiplier;
        }
    }

    function onERC721Received(
        address, /* _operator */
        address, /*  _from */
        uint256, /*  _tokenId */
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    }

    function onERC1155Received(
        address, /* _operator */
        address, /* _from */
        uint256, /* _id */
        uint256, /* _value */
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
    }

    function onERC1155BatchReceived(
        address, /* _operator */
        address, /* _from */
        uint256[] calldata, /* _ids */
        uint256[] calldata, /* _values */
        bytes calldata /* _data */
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
    }

    /// @notice Calculating and setting how much payout a bidder will receive if outbid
    /// @dev Only callable internally
    function calculateIncentives(uint256 _auctionId, uint256 _newBidValue) internal view returns (uint256) {
        uint256 bidDecimals = getAuctionBidDecimals(_auctionId);
        uint256 bidIncMax = getAuctionIncMax(_auctionId);

        //Init the baseline bid we need to perform against
        uint256 baseBid = (s.auctions[_auctionId].highestBid * (bidDecimals + getAuctionStepMin(_auctionId))) / bidDecimals;

        //If no bids are present, set a basebid value of 1 to prevent divide by 0 errors
        if (baseBid == 0) {
            baseBid = 1;
        }

        //Ratio of newBid compared to expected minBid
        uint256 decimaledRatio = ((bidDecimals * getAuctionBidMultiplier(_auctionId) * (_newBidValue - baseBid)) / baseBid) +
            getAuctionIncMin(_auctionId) *
            bidDecimals;

        if (decimaledRatio > (bidDecimals * bidIncMax)) {
            decimaledRatio = bidDecimals * bidIncMax;
        }

        return (_newBidValue * decimaledRatio) / (bidDecimals * bidDecimals);
    }

    function registerMassERC721Each(
        address _GBM,
        bool _useInitiator,
        address _ERC721Contract,
        uint256[] memory _tokenIds
    ) external onlyOwner {
        require(_tokenIds.length > 0, "No auctions to create");
        for (uint256 index = 0; index < _tokenIds.length; index++) {
            uint256 tokenId = _tokenIds[index];
            IERC721(_ERC721Contract).safeTransferFrom(msg.sender, _GBM, tokenId, "");
            registerAnAuctionToken(_ERC721Contract, tokenId, bytes4(keccak256("ERC721")), _useInitiator);
        }

        // _tokenIDStart++;
    }

    function registerMassERC1155Each(
        address _GBM,
        bool _useInitiator,
        address _ERC1155Contract,
        uint256 _tokenID,
        uint256 _indexStart,
        uint256 _indexEnd
    ) external onlyOwner {
        registerAnAuctionContract(_ERC1155Contract);
        IERC1155(_ERC1155Contract).safeTransferFrom(msg.sender, _GBM, _tokenID, _indexEnd - _indexStart, "");
        while (_indexStart < _indexEnd) {
            registerAnAuctionToken(_ERC1155Contract, _tokenID, bytes4(keccak256("ERC1155")), _useInitiator);
            _indexStart++;
        }
    }
}