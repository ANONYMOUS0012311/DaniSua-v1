const REFRESH_NEEDED_STATUS =
  "offers_need_refresh";

const REFRESH_NEEDED_MESSAGE =
  "Ho trovato prodotti compatibili, ma nessuna offerta è abbastanza recente e verificata per consigliarti un acquisto adesso. Sto mostrando i risultati disponibili come riferimento: i prezzi vanno ricontrollati.";


function finalizeOfferOutcome(
  {
    status,
    canRecommend,
    message,
    bestOffer,
    resultCount = 0,
  } = {}
) {
  if (
    canRecommend === true &&
    !bestOffer &&
    Number(
      resultCount
    ) > 0
  ) {
    return {
      status:
        REFRESH_NEEDED_STATUS,
      canRecommend:
        false,
      message:
        REFRESH_NEEDED_MESSAGE,
      needsRefresh:
        true,
    };
  }

  return {
    status:
      status ||
      null,
    canRecommend:
      canRecommend === true,
    message:
      message ||
      null,
    needsRefresh:
      false,
  };
}


module.exports = {
  REFRESH_NEEDED_STATUS,
  REFRESH_NEEDED_MESSAGE,
  finalizeOfferOutcome,
};
