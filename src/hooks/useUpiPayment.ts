import { useCallback, useEffect, useMemo, useState } from 'react';
import { BusRoute, UpiTicketPass } from '../types/transit';
import { calculateRouteFare } from '../utils/transitHelpers';

export type UpiAppOption = 'GPay' | 'PhonePe' | 'Paytm' | 'BHIM UPI';

export const UPI_APP_OPTIONS: readonly UpiAppOption[] = [
  'GPay',
  'PhonePe',
  'Paytm',
  'BHIM UPI',
];

interface PurchaseUpiTicketParams {
  route: BusRoute;
  originStop: string;
  destinationStop: string;
  adultCount: number;
  womenFreeCount: number;
  totalFareInr: number;
  upiApp: UpiAppOption;
}

interface UseUpiPaymentOptions {
  ticketModalRoute: BusRoute | null;
  purchaseUpiTicket: (params: PurchaseUpiTicketParams) => UpiTicketPass;
}

/**
 * Manages stop selection, passenger counts, fare computation, simulated UPI payment
 * confirmation, and the live verification clock for UpiTicketModal.
 */
export function useUpiPayment({
  ticketModalRoute,
  purchaseUpiTicket,
}: UseUpiPaymentOptions) {
  const [originIdx, setOriginIdx] = useState<number>(0);
  const [destIdx, setDestIdx] = useState<number>(1);
  const [adultCount, setAdultCount] = useState<number>(1);
  const [womenFreeCount, setWomenFreeCount] = useState<number>(0);
  const [selectedUpi, setSelectedUpi] = useState<UpiAppOption>('GPay');
  const [paying, setPaying] = useState<boolean>(false);
  const [issuedPass, setIssuedPass] = useState<UpiTicketPass | null>(null);
  const [liveClock, setLiveClock] = useState<string>('');

  useEffect(() => {
    if (ticketModalRoute) {
      setOriginIdx(0);
      setDestIdx(Math.max(1, ticketModalRoute.stops.length - 1));
      setAdultCount(1);
      setWomenFreeCount(0);
      setPaying(false);
      setIssuedPass(null);
    }
  }, [ticketModalRoute]);

  useEffect(() => {
    if (!issuedPass) return;
    const updateClock = () =>
      setLiveClock(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [issuedPass]);

  const stops = ticketModalRoute?.stops ?? [];
  const originStop = stops[originIdx]?.name ?? ticketModalRoute?.origin ?? '';
  const destStop = stops[destIdx]?.name ?? ticketModalRoute?.destination ?? '';

  const singleAdultFare = useMemo(() => {
    if (!ticketModalRoute) return 0;
    return calculateRouteFare(ticketModalRoute, originStop, destStop);
  }, [ticketModalRoute, originStop, destStop]);

  const totalFare = singleAdultFare * adultCount;

  const handleOriginChange = useCallback(
    (idx: number) => {
      setOriginIdx(idx);
      if (destIdx === idx) {
        setDestIdx(idx < stops.length - 1 ? stops.length - 1 : 0);
      }
    },
    [destIdx, stops.length]
  );

  const handlePayNow = useCallback(() => {
    if (!ticketModalRoute || (adultCount === 0 && womenFreeCount === 0)) return;
    setPaying(true);
    setTimeout(() => {
      const pass = purchaseUpiTicket({
        route: ticketModalRoute,
        originStop,
        destinationStop: destStop,
        adultCount,
        womenFreeCount,
        totalFareInr: totalFare,
        upiApp: selectedUpi,
      });
      setPaying(false);
      setIssuedPass(pass);
    }, 600);
  }, [
    ticketModalRoute,
    adultCount,
    womenFreeCount,
    purchaseUpiTicket,
    originStop,
    destStop,
    totalFare,
    selectedUpi,
  ]);

  return {
    stops,
    originIdx,
    destIdx,
    setDestIdx,
    handleOriginChange,
    adultCount,
    setAdultCount,
    womenFreeCount,
    setWomenFreeCount,
    selectedUpi,
    setSelectedUpi,
    paying,
    issuedPass,
    liveClock,
    singleAdultFare,
    totalFare,
    handlePayNow,
  };
}
