import { auction1 } from "./data/auction1";

interface AuctionPreset {
  startTime: number;
  endTime: number;
  hammerTimeDuration: number;
  bidDecimals: number;
  stepMin: number;
  incMin: number;
  incMax: number;
  bidMultiplier: number;
}

interface TokenCounts {
  none: number;
  low: number;
  medium: number;
  high: number;
  degen: number;
  test: number;
}

interface AuctionPresets {
  none: AuctionPreset;
  low: AuctionPreset;
  medium: AuctionPreset;
  high: AuctionPreset;
  degen: AuctionPreset;
  test: AuctionPreset;
}

interface AuctionERC721Config {
  id: string;
  ercType: number;

  // auction params
  auctionTokenCounts: TokenCounts;
  auctionPresets: AuctionPresets;

  // if prexisiting listing
  initialIndex: number;

  //
  token: string;
  tokenId: number; // index to start auctioning from if 721
  // or its the wearables id if erc 1155

  // gbm deployment params
  gbm: string;
}

const startTime = 1638457200; //Dec 2, 3PM UTC
const endTime = 1638716400; //Dec 5, 3PM UTC

export default <AuctionERC721Config>{
  id: "realm auction 2", // human id
  auctionPresets: {
    none: {
      startTime: startTime,
      endTime: endTime,
      hammerTimeDuration: 1200,
      bidDecimals: 100000,
      stepMin: 5000,
      incMin: 0,
      incMax: 0,
      bidMultiplier: 0,
    },
    low: {
      startTime: startTime,
      endTime: endTime,
      hammerTimeDuration: 1200,
      bidDecimals: 100000,
      stepMin: 5000,
      incMin: 500,
      incMax: 5000,
      bidMultiplier: 5080,
    },
    medium: {
      startTime: startTime,
      endTime: endTime,
      hammerTimeDuration: 1200,
      bidDecimals: 100000,
      stepMin: 10000,
      incMin: 1000,
      incMax: 10000,
      bidMultiplier: 11120,
    },
    high: {
      startTime: startTime,
      endTime: endTime,
      hammerTimeDuration: 1200,
      bidDecimals: 100000,
      stepMin: 15000,
      incMin: 1500,
      incMax: 15000,
      bidMultiplier: 18700,
    },
    degen: {
      startTime: startTime,
      endTime: endTime,
      hammerTimeDuration: 1200,
      bidDecimals: 100000,
      stepMin: 30000,
      incMin: 3000,
      incMax: 30000,
      bidMultiplier: 48740,
    },
    test: {
      startTime: startTime,
      endTime: endTime,
      hammerTimeDuration: 1200,
      bidDecimals: 100000,
      stepMin: 30000,
      incMin: 3000,
      incMax: 30000,
      bidMultiplier: 48740,
    },
  },
  auctionTokenCounts: {
    none: 0,
    low: 0,
    medium: auction1.length,
    high: 0,
    degen: 0,
    test: 0,
  },

  initialIndex: 0, // none previous, so start at 0
  ercType: 721,
  tokenId: 0, // if erc721, tokenId == 0
  skip: 0,
  token: "", // if erc
  gbmInitiator: "",
  gbm: "",
};
