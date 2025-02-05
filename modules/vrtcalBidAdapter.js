import {registerBidder} from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import {ajax} from '../src/ajax.js';
import { config } from '../src/config.js';
import {deepAccess, isFn, isPlainObject} from '../src/utils.js';

const GVLID = 706;

export const spec = {
  code: 'vrtcal',
  gvlid: GVLID,
  supportedMediaTypes: [BANNER],
  isBidRequestValid: function (bid) {
    return true;
  },
  buildRequests: function (bidRequests) {
    const requests = bidRequests.map(function (bid) {
      let floor = 0;

      if (isFn(bid.getFloor)) {
        const floorInfo = bid.getFloor({ currency: 'USD', mediaType: 'banner', size: bid.sizes.map(([w, h]) => ({w, h})) });

        if (isPlainObject(floorInfo) && floorInfo.currency === 'USD' && !isNaN(parseFloat(floorInfo.floor))) {
          floor = Math.max(floor, parseFloat(floorInfo.floor));
        }
      }

      let gdprApplies = 0;
      let gdprConsent = '';
      let ccpa = '';
      let coppa = 0;
      let tmax = 0;
      let eids = [];

      if (bidRequests[0].userIdAsEids && bidRequests[0].userIdAsEids.length > 0) {
        eids = bidRequests[0].userIdAsEids;
      }

      if (bid && bid.gdprConsent) {
        gdprApplies = bid.gdprConsent.gdprApplies ? 1 : 0;
        gdprConsent = bid.gdprConsent.consentString;
      }

      if (bid && bid.uspConsent) {
        ccpa = bid.uspConsent;
      }

      if (config.getConfig('coppa') === true) {
        coppa = 1;
      }

      tmax = bid.timeout;

      const params = {
        prebidJS: 1,
        prebidAdUnitCode: bid.adUnitCode,
        id: bid.bidId,
        tmax: tmax,
        imp: [{
          id: '1',
          banner: {
          },
          bidfloor: floor
        }],
        site: {
          id: 'VRTCAL_FILLED',
          name: 'VRTCAL_FILLED',
          cat: deepAccess(bid, 'ortb2.site.cat', []),
          domain: decodeURIComponent(window.location.href).replace('https://', '').replace('http://', '').split('/')[0],
          page: window.location.href
        },
        device: {
          language: navigator.language,
          ua: navigator.userAgent,
          ip: deepAccess(bid, 'params.bidOverride.device.ip') || deepAccess(bid, 'params.ext.ip') || undefined
        },
        regs: {
          coppa: coppa,
          ext: {
            gdpr: gdprApplies,
            us_privacy: ccpa
          }
        },
        user: {
          ext: {
            consent: gdprConsent,
            eids: eids
          }
        }
      };

      if (typeof (bid.mediaTypes) !== 'undefined' && typeof (bid.mediaTypes.banner) !== 'undefined' && typeof (bid.mediaTypes.banner.sizes) !== 'undefined') {
        params.imp[0].banner.w = bid.mediaTypes.banner.sizes[0][0];
        params.imp[0].banner.h = bid.mediaTypes.banner.sizes[0][1];
      } else {
        params.imp[0].banner.w = bid.sizes[0][0];
        params.imp[0].banner.h = bid.sizes[0][1];
      }

      if (bid.ortb2?.regs?.gpp) {
        params.regs.ext.gpp = bid.ortb2.regs.gpp;
        params.regs.ext.gpp_sid = bid.ortb2.regs.gpp_sid;
      }

      return {method: 'POST', url: 'https://rtb.vrtcal.com/bidder_prebid.vap?ssp=1804', data: JSON.stringify(params), options: {withCredentials: false, crossOrigin: true}};
    });

    return requests;
  },
  interpretResponse: function (serverResponse, bidRequest) {
    if (!serverResponse || !serverResponse.body) {
      return [];
    }

    const bidResponses = [];

    var response = serverResponse.body;

    if (response) {
      const bidResponse = {
        requestId: response.id,
        cpm: response.seatbid[0].bid[0].price,
        width: response.seatbid[0].bid[0].w,
        height: response.seatbid[0].bid[0].h,
        creativeId: response.seatbid[0].bid[0].crid,
        currency: 'USD',
        netRevenue: true,
        ttl: 900,
        ad: response.seatbid[0].bid[0].adm,
        nurl: response.seatbid[0].bid[0].nurl
      };

      if (response.seatbid[0].bid[0].adomain && response.seatbid[0].bid[0].adomain.length) {
        bidResponse.meta = {
          advertiserDomains: response.seatbid[0].bid[0].adomain
        };
      }

      bidResponses.push(bidResponse);
    }
    return bidResponses;
  },
  onBidWon: function(bid) {
    if (!bid.nurl) { return false; }
    const winUrl = bid.nurl.replace(
      /\$\{AUCTION_PRICE\}/,
      bid.cpm
    );
    ajax(winUrl, null);
    return true;
  }
};

registerBidder(spec);
