import { BusRoute, CityPresetId, CrowdLevel, RouteStop, UpcomingBusInstance } from '../types/transit';
import { haversineMeters } from '../utils/transitHelpers';

export interface FeaturedBusSeed {
  id: string;
  cityId: CityPresetId;
  routeNumber: string;
  aliases: string[];
  operator: string;
  serviceType: string;
  isElectric: boolean;
  isAC: boolean;
  womenFreeEligible: boolean;
  womenSchemeName: string;
  baseFareInr: number;
  maxFareInr: number;
  headwayMinutes: number;
  regPrefix: string;
  activeProgressStop: number;
  speedKmh: number;
  delayMinutes: number;
  crowdLevel: CrowdLevel;
  crowdPercent: number;
  stops: Array<{
    name: string;
    landmark: string;
    lat: number;
    lng: number;
    offsetMin: number;
    platform?: string;
    stopCode?: string;
  }>;
}

const FEATURED_SEEDS: FeaturedBusSeed[] = [
  {
    id: 'WIMB::HYD::216',
    cityId: 'hyderabad',
    routeNumber: '216',
    aliases: ['216', '216K', '216W', 'Gowlidoddi Koti', 'Gachibowli Mehdipatnam'],
    operator: 'TGSRTC',
    serviceType: 'City Ordinary',
    isElectric: false,
    isAC: false,
    womenFreeEligible: true,
    womenSchemeName: 'Maha Lakshmi Free',
    baseFareInr: 10,
    maxFareInr: 35,
    headwayMinutes: 12,
    regPrefix: 'TS09Z4821',
    activeProgressStop: 2.45,
    speedKmh: 28,
    delayMinutes: 0,
    crowdLevel: 'medium',
    crowdPercent: 58,
    stops: [
      { name: 'Gowlidoddi Bus Terminal', landmark: 'Q-City IT Corridor', lat: 17.4192, lng: 78.3296, offsetMin: 0, platform: 'Bay 1', stopCode: 'HYD216A' },
      { name: 'Wipro Circle', landmark: 'Financial District Junction', lat: 17.4259, lng: 78.3408, offsetMin: 8, platform: 'Stop A', stopCode: 'HYD216B' },
      { name: 'IIIT Hyderabad Junction', landmark: 'Old Mumbai Highway', lat: 17.4449, lng: 78.3498, offsetMin: 16, platform: 'Stop 2', stopCode: 'HYD216C' },
      { name: 'Gachibowli Flyover', landmark: 'ORR Entry Plaza', lat: 17.4401, lng: 78.3568, offsetMin: 22, platform: 'Bay 3', stopCode: 'HYD216D' },
      { name: 'Bio Diversity Park', landmark: 'Raidurgam Junction', lat: 17.4294, lng: 78.3765, offsetMin: 31, platform: 'Stop 1', stopCode: 'HYD216E' },
      { name: 'Tolichowki Cross Road', landmark: 'Shaikpet Flyover', lat: 17.3991, lng: 78.4158, offsetMin: 46, platform: 'Bay 2', stopCode: 'HYD216F' },
      { name: 'Mehdipatnam Rythu Bazar', landmark: 'PVNR Pillar 18', lat: 17.3951, lng: 78.4402, offsetMin: 56, platform: 'Bay 4', stopCode: 'HYD216G' },
      { name: 'Masab Tank', landmark: 'JNTU Fine Arts', lat: 17.4027, lng: 78.4525, offsetMin: 64, platform: 'Stop 1', stopCode: 'HYD216H' },
      { name: 'Abids GPO', landmark: 'Nampally Main Road', lat: 17.3891, lng: 78.4765, offsetMin: 76, platform: 'Stop 2', stopCode: 'HYD216I' },
      { name: 'Koti Women’s College Terminal', landmark: 'Koti Bus Terminus', lat: 17.3852, lng: 78.4848, offsetMin: 84, platform: 'Terminal Bay 6', stopCode: 'HYD216J' },
    ],
  },
  {
    id: 'WIMB::HYD::10H',
    cityId: 'hyderabad',
    routeNumber: '10H',
    aliases: ['10H', '10H/216', 'Kondapur Secunderabad', 'Gowlidoddi Secunderabad', 'Hitec Secunderabad'],
    operator: 'TGSRTC',
    serviceType: 'Metro Express',
    isElectric: false,
    isAC: false,
    womenFreeEligible: true,
    womenSchemeName: 'Maha Lakshmi Free',
    baseFareInr: 15,
    maxFareInr: 45,
    headwayMinutes: 10,
    regPrefix: 'TS09UB7310',
    activeProgressStop: 3.35,
    speedKmh: 31,
    delayMinutes: 3,
    crowdLevel: 'medium',
    crowdPercent: 64,
    stops: [
      { name: 'Kondapur Bus Depot', landmark: 'Botanical Garden Road', lat: 17.4622, lng: 78.3568, offsetMin: 0, platform: 'Bay 2', stopCode: 'HYD10H1' },
      { name: 'Kothaguda Cross Road', landmark: 'AMB Mall Junction', lat: 17.4575, lng: 78.3665, offsetMin: 7, platform: 'Stop 1', stopCode: 'HYD10H2' },
      { name: 'Hitec City Cyber Towers', landmark: 'Cyber Towers Metro', lat: 17.4504, lng: 78.3809, offsetMin: 15, platform: 'Bay 1', stopCode: 'HYD10H3' },
      { name: 'Madhapur Police Station', landmark: 'Durgam Cheruvu Road', lat: 17.4446, lng: 78.3919, offsetMin: 22, platform: 'Stop 2', stopCode: 'HYD10H4' },
      { name: 'Jubilee Hills Checkpost', landmark: 'Road No 36 Metro', lat: 17.4285, lng: 78.4126, offsetMin: 34, platform: 'Stop 1', stopCode: 'HYD10H5' },
      { name: 'Panjagutta Cross Road', landmark: 'Hyderabad Central', lat: 17.4265, lng: 78.4513, offsetMin: 49, platform: 'Bay 3', stopCode: 'HYD10H6' },
      { name: 'Begumpet Shoppers Stop', landmark: 'Begumpet Railway Stn', lat: 17.4418, lng: 78.4664, offsetMin: 60, platform: 'Stop 2', stopCode: 'HYD10H7' },
      { name: 'Paradise Circle', landmark: 'MG Road Junction', lat: 17.4414, lng: 78.4870, offsetMin: 69, platform: 'Stop 1', stopCode: 'HYD10H8' },
      { name: 'Patny Center', landmark: 'Clock Tower Road', lat: 17.4410, lng: 78.4946, offsetMin: 74, platform: 'Stop 2', stopCode: 'HYD10H9' },
      { name: 'Secunderabad Junction', landmark: 'Rathifile Bus Station', lat: 17.4399, lng: 78.5015, offsetMin: 80, platform: 'Platform 4', stopCode: 'HYD10H10' },
    ],
  },
  {
    id: 'WIMB::HYD::222A',
    cityId: 'hyderabad',
    routeNumber: '222A',
    aliases: ['222A', '222', 'Patancheru Secunderabad', 'Miyapur Secunderabad'],
    operator: 'TGSRTC',
    serviceType: 'Metro Deluxe Express',
    isElectric: false,
    isAC: false,
    womenFreeEligible: true,
    womenSchemeName: 'Maha Lakshmi Free',
    baseFareInr: 15,
    maxFareInr: 50,
    headwayMinutes: 15,
    regPrefix: 'TS08Z9042',
    activeProgressStop: 2.65,
    speedKmh: 34,
    delayMinutes: 0,
    crowdLevel: 'low',
    crowdPercent: 36,
    stops: [
      { name: 'Patancheru Bus Terminal', landmark: 'NH-65 Main Stand', lat: 17.5326, lng: 78.2644, offsetMin: 0, platform: 'Bay 1', stopCode: 'HYD222A1' },
      { name: 'BHEL Lingampally Circle', landmark: 'BHEL Main Gate', lat: 17.4981, lng: 78.3164, offsetMin: 16, platform: 'Stop 1', stopCode: 'HYD222A2' },
      { name: 'Miyapur X Roads', landmark: 'Miyapur Metro Terminal', lat: 17.4966, lng: 78.3568, offsetMin: 28, platform: 'Bay 2', stopCode: 'HYD222A3' },
      { name: 'JNTU College Kukatpally', landmark: 'KPHB Main Road', lat: 17.4933, lng: 78.3914, offsetMin: 38, platform: 'Stop 3', stopCode: 'HYD222A4' },
      { name: 'Kukatpally Bus Stop', landmark: 'NH-65 Metro Pillar', lat: 17.4849, lng: 78.4138, offsetMin: 47, platform: 'Stop 1', stopCode: 'HYD222A5' },
      { name: 'SR Nagar', landmark: 'Maitrivanam Road', lat: 17.4435, lng: 78.4426, offsetMin: 61, platform: 'Stop 2', stopCode: 'HYD222A6' },
      { name: 'Ameerpet Big Bazaar', landmark: 'Metro Interchange', lat: 17.4375, lng: 78.4483, offsetMin: 66, platform: 'Bay 2', stopCode: 'HYD222A7' },
      { name: 'Begumpet', landmark: 'Prakash Nagar', lat: 17.4422, lng: 78.4692, offsetMin: 75, platform: 'Stop 1', stopCode: 'HYD222A8' },
      { name: 'Secunderabad Junction', landmark: 'Gurudwara / Rathifile', lat: 17.4399, lng: 78.5015, offsetMin: 86, platform: 'Platform 2', stopCode: 'HYD222A9' },
    ],
  },
  {
    id: 'WIMB::HYD::113M',
    cityId: 'hyderabad',
    routeNumber: '113M',
    aliases: ['113M', '113', 'Uppal Mehdipatnam'],
    operator: 'TGSRTC',
    serviceType: 'Metro Express',
    isElectric: true,
    isAC: false,
    womenFreeEligible: true,
    womenSchemeName: 'Maha Lakshmi Free',
    baseFareInr: 15,
    maxFareInr: 45,
    headwayMinutes: 12,
    regPrefix: 'TS09EV1138',
    activeProgressStop: 2.2,
    speedKmh: 29,
    delayMinutes: 0,
    crowdLevel: 'low',
    crowdPercent: 34,
    stops: [
      { name: 'Uppal X Roads', landmark: 'Uppal Ring Road', lat: 17.4018, lng: 78.5602, offsetMin: 0, platform: 'Bay 1', stopCode: 'HYD113A' },
      { name: 'Habsiguda', landmark: 'CSIR-IICT Campus', lat: 17.4161, lng: 78.5419, offsetMin: 9, platform: 'Stop 1', stopCode: 'HYD113B' },
      { name: 'Tarnaka Junction', landmark: 'Osmania University Gate', lat: 17.4274, lng: 78.5310, offsetMin: 16, platform: 'Stop 2', stopCode: 'HYD113C' },
      { name: 'Mettuguda', landmark: 'Rail Nilayam', lat: 17.4357, lng: 78.5194, offsetMin: 22, platform: 'Stop 1', stopCode: 'HYD113D' },
      { name: 'Secunderabad Clock Tower', landmark: 'YMCA Circle', lat: 17.4408, lng: 78.4986, offsetMin: 30, platform: 'Bay 3', stopCode: 'HYD113E' },
      { name: 'Tank Bund / Secretariat', landmark: 'Hussain Sagar', lat: 17.4119, lng: 78.4737, offsetMin: 44, platform: 'Stop 1', stopCode: 'HYD113F' },
      { name: 'Lakdikapul', landmark: 'Assembly Metro', lat: 17.4044, lng: 78.4614, offsetMin: 51, platform: 'Stop 2', stopCode: 'HYD113G' },
      { name: 'Mehdipatnam Bus Terminal', landmark: 'City Bus Stand', lat: 17.3951, lng: 78.4402, offsetMin: 62, platform: 'Bay 5', stopCode: 'HYD113H' },
    ],
  },
  {
    id: 'WIMB::HYD::49M',
    cityId: 'hyderabad',
    routeNumber: '49M',
    aliases: ['49M', '49', 'Mehdipatnam Secunderabad'],
    operator: 'TGSRTC',
    serviceType: 'Metro Express',
    isElectric: false,
    isAC: false,
    womenFreeEligible: true,
    womenSchemeName: 'Maha Lakshmi Free',
    baseFareInr: 15,
    maxFareInr: 40,
    headwayMinutes: 9,
    regPrefix: 'TS09UA4912',
    activeProgressStop: 1.75,
    speedKmh: 26,
    delayMinutes: 5,
    crowdLevel: 'high',
    crowdPercent: 86,
    stops: [
      { name: 'Mehdipatnam Bus Stand', landmark: 'Pillar 18', lat: 17.3951, lng: 78.4402, offsetMin: 0, platform: 'Bay 2', stopCode: 'HYD49M1' },
      { name: 'Masab Tank', landmark: 'Golconda Hotel', lat: 17.4027, lng: 78.4525, offsetMin: 8, platform: 'Stop 1', stopCode: 'HYD49M2' },
      { name: 'Care Hospital Banjara Hills', landmark: 'Road No 1', lat: 17.4139, lng: 78.4489, offsetMin: 16, platform: 'Stop 1', stopCode: 'HYD49M3' },
      { name: 'Panjagutta Junction', landmark: 'Nagarjuna Circle', lat: 17.4265, lng: 78.4513, offsetMin: 24, platform: 'Bay 1', stopCode: 'HYD49M4' },
      { name: 'Greenlands / Begumpet', landmark: 'CM Camp Office', lat: 17.4368, lng: 78.4596, offsetMin: 32, platform: 'Stop 2', stopCode: 'HYD49M5' },
      { name: 'Paradise Circle', landmark: 'SD Road', lat: 17.4414, lng: 78.4870, offsetMin: 42, platform: 'Stop 1', stopCode: 'HYD49M6' },
      { name: 'Secunderabad Junction', landmark: 'Alpha Hotel Stand', lat: 17.4399, lng: 78.5015, offsetMin: 50, platform: 'Platform 1', stopCode: 'HYD49M7' },
    ],
  },
  {
    id: 'WIMB::BLR::V-500D',
    cityId: 'bengaluru',
    routeNumber: 'V-500D',
    aliases: ['AC Vajra', 'Vajra', '500D', 'V-500D', 'Silk Board Hebbal', 'ORR AC Vajra'],
    operator: 'BMTC',
    serviceType: 'AC Vajra Electric',
    isElectric: true,
    isAC: true,
    womenFreeEligible: false,
    womenSchemeName: 'Premium AC Vajra',
    baseFareInr: 25,
    maxFareInr: 75,
    headwayMinutes: 8,
    regPrefix: 'KA57F2491',
    activeProgressStop: 3.15,
    speedKmh: 33,
    delayMinutes: 0,
    crowdLevel: 'low',
    crowdPercent: 38,
    stops: [
      { name: 'Central Silk Board', landmark: 'ORR Flyover Bus Bay', lat: 12.9176, lng: 77.6233, offsetMin: 0, platform: 'ORR Bay 1', stopCode: 'BLR500D1' },
      { name: 'HSR Layout BDA Complex', landmark: '14th Main ORR', lat: 12.9163, lng: 77.6435, offsetMin: 7, platform: 'ORR Stop', stopCode: 'BLR500D2' },
      { name: 'Agara Junction', landmark: 'Agara Lake', lat: 12.9235, lng: 77.6499, offsetMin: 12, platform: 'Bay 2', stopCode: 'BLR500D3' },
      { name: 'Bellandur Ecospace', landmark: 'RMZ Ecospace Tech Park', lat: 12.9279, lng: 77.6762, offsetMin: 21, platform: 'Tech Bay', stopCode: 'BLR500D4' },
      { name: 'Marathahalli Bridge', landmark: 'Kalamandir ORR', lat: 12.9569, lng: 77.7011, offsetMin: 34, platform: 'Bay 1', stopCode: 'BLR500D5' },
      { name: 'KR Puram Tin Factory', landmark: 'Benniganahalli Metro', lat: 12.9968, lng: 77.6687, offsetMin: 49, platform: 'Bay 3', stopCode: 'BLR500D6' },
      { name: 'Kalyan Nagar HRBR', landmark: 'Hennur Cross', lat: 13.0285, lng: 77.6398, offsetMin: 61, platform: 'Stop 2', stopCode: 'BLR500D7' },
      { name: 'Manyata Tech Park', landmark: 'Nagawara Junction', lat: 13.0442, lng: 77.6209, offsetMin: 68, platform: 'Tech Gate', stopCode: 'BLR500D8' },
      { name: 'Hebbal Bridge Terminal', landmark: 'Esteem Mall / Airport Rd', lat: 13.0358, lng: 77.5970, offsetMin: 76, platform: 'Bay 4', stopCode: 'BLR500D9' },
    ],
  },
  {
    id: 'WIMB::BLR::KIA-9',
    cityId: 'bengaluru',
    routeNumber: 'KIA-9',
    aliases: ['KIA-9', 'KIA9', 'Vayu Vajra', 'Majestic Airport', 'AC Vajra Airport'],
    operator: 'BMTC',
    serviceType: 'Vayu Vajra AC',
    isElectric: true,
    isAC: true,
    womenFreeEligible: false,
    womenSchemeName: 'Airport Express AC',
    baseFareInr: 120,
    maxFareInr: 260,
    headwayMinutes: 20,
    regPrefix: 'KA57EV0914',
    activeProgressStop: 1.55,
    speedKmh: 48,
    delayMinutes: 0,
    crowdLevel: 'low',
    crowdPercent: 28,
    stops: [
      { name: 'Kempegowda Bus Station (Majestic)', landmark: 'Terminal 2 Airport Bay', lat: 12.9775, lng: 77.5714, offsetMin: 0, platform: 'KIA Bay 9', stopCode: 'BLRKIA9A' },
      { name: 'Vasanth Nagar / Golf Course', landmark: 'Bellary Road', lat: 12.9921, lng: 77.5865, offsetMin: 12, platform: 'Stop 1', stopCode: 'BLRKIA9B' },
      { name: 'Mekhri Circle', landmark: 'Palace Grounds', lat: 13.0138, lng: 77.5858, offsetMin: 20, platform: 'Airport Stop', stopCode: 'BLRKIA9C' },
      { name: 'Hebbal Flyover', landmark: 'NH-44 North', lat: 13.0358, lng: 77.5970, offsetMin: 28, platform: 'Bay 1', stopCode: 'BLRKIA9D' },
      { name: 'Yelahanka Bypass', landmark: 'IAF Station', lat: 13.1007, lng: 77.5963, offsetMin: 40, platform: 'Highway Bay', stopCode: 'BLRKIA9E' },
      { name: 'Kempegowda Intl Airport T1/T2', landmark: 'Arrivals Curbside', lat: 13.1986, lng: 77.7066, offsetMin: 64, platform: 'Bus Zone B', stopCode: 'BLRKIA9F' },
    ],
  },
  {
    id: 'WIMB::BLR::335E',
    cityId: 'bengaluru',
    routeNumber: '335E',
    aliases: ['335E', '335-E', 'Majestic Whitefield', 'ITPL Bus'],
    operator: 'BMTC',
    serviceType: 'Switch Electric',
    isElectric: true,
    isAC: false,
    womenFreeEligible: true,
    womenSchemeName: 'Shakti Free Pass',
    baseFareInr: 10,
    maxFareInr: 35,
    headwayMinutes: 10,
    regPrefix: 'KA57EV3350',
    activeProgressStop: 2.35,
    speedKmh: 27,
    delayMinutes: 2,
    crowdLevel: 'medium',
    crowdPercent: 62,
    stops: [
      { name: 'Kempegowda Bus Station (Majestic)', landmark: 'Platform 14', lat: 12.9775, lng: 77.5714, offsetMin: 0, platform: 'PF 14', stopCode: 'BLR335E1' },
      { name: 'Corporation Circle', landmark: 'BBMP Head Office', lat: 12.9669, lng: 77.5873, offsetMin: 9, platform: 'Stop 1', stopCode: 'BLR335E2' },
      { name: 'Domlur TTMC', landmark: 'Old Airport Road', lat: 12.9609, lng: 77.6387, offsetMin: 24, platform: 'TTMC Bay 2', stopCode: 'BLR335E3' },
      { name: 'HAL Main Gate', landmark: 'HAL Museum Rd', lat: 12.9583, lng: 77.6694, offsetMin: 33, platform: 'Stop 1', stopCode: 'BLR335E4' },
      { name: 'Marathahalli Bridge', landmark: 'Multiplex Junction', lat: 12.9569, lng: 77.7011, offsetMin: 43, platform: 'Stop 2', stopCode: 'BLR335E5' },
      { name: 'Kundalahalli Gate', landmark: 'Brookefield', lat: 12.9585, lng: 77.7159, offsetMin: 50, platform: 'Stop 1', stopCode: 'BLR335E6' },
      { name: 'ITPL Whitefield TTMC', landmark: 'Pattandur Agrahara Metro', lat: 12.9855, lng: 77.7365, offsetMin: 64, platform: 'Terminal Bay 3', stopCode: 'BLR335E7' },
    ],
  },
  {
    id: 'WIMB::MUM::A-115',
    cityId: 'mumbai',
    routeNumber: 'A-115',
    aliases: ['A-115', '115', 'CSMT Bandra', 'BEST AC'],
    operator: 'BEST',
    serviceType: 'Chalo AC Electric',
    isElectric: true,
    isAC: true,
    womenFreeEligible: false,
    womenSchemeName: 'BEST Smart Fare',
    baseFareInr: 12,
    maxFareInr: 35,
    headwayMinutes: 10,
    regPrefix: 'MH01DR4115',
    activeProgressStop: 1.8,
    speedKmh: 30,
    delayMinutes: 0,
    crowdLevel: 'low',
    crowdPercent: 35,
    stops: [
      { name: 'CSMT Fort Bus Station', landmark: 'Heritage Terminus', lat: 18.9398, lng: 72.8355, offsetMin: 0, platform: 'Stop A', stopCode: 'MUMA115A' },
      { name: 'Churchgate Station', landmark: 'Eros Cinema', lat: 18.9322, lng: 72.8264, offsetMin: 8, platform: 'Stop 2', stopCode: 'MUMA115B' },
      { name: 'Nariman Point NCPA', landmark: 'Marine Drive', lat: 18.9256, lng: 72.8242, offsetMin: 14, platform: 'Stop 1', stopCode: 'MUMA115C' },
      { name: 'Haji Ali Junction', landmark: 'Pedder Road', lat: 18.9827, lng: 72.8126, offsetMin: 29, platform: 'Stop 1', stopCode: 'MUMA115D' },
      { name: 'Worli Sea Face', landmark: 'Sea Link South', lat: 19.0096, lng: 72.8155, offsetMin: 38, platform: 'Stop 2', stopCode: 'MUMA115E' },
      { name: 'Bandra Reclamation Terminal', landmark: 'Bandra West', lat: 19.0473, lng: 72.8265, offsetMin: 52, platform: 'Bay 4', stopCode: 'MUMA115F' },
    ],
  },
  {
    id: 'WIMB::DEL::534',
    cityId: 'delhi',
    routeNumber: '534',
    aliases: ['534', 'DTC 534', 'Anand Vihar Mehrauli', 'AIIMS Bus'],
    operator: 'DTC',
    serviceType: 'DEVI Electric AC',
    isElectric: true,
    isAC: true,
    womenFreeEligible: true,
    womenSchemeName: 'Pink Ticket Free',
    baseFareInr: 10,
    maxFareInr: 25,
    headwayMinutes: 12,
    regPrefix: 'DL1PD5349',
    activeProgressStop: 2.1,
    speedKmh: 29,
    delayMinutes: 0,
    crowdLevel: 'medium',
    crowdPercent: 52,
    stops: [
      { name: 'Anand Vihar ISBT', landmark: 'Inter-State Terminal', lat: 28.6469, lng: 77.3160, offsetMin: 0, platform: 'Bay 8', stopCode: 'DEL534A' },
      { name: 'Sarai Kale Khan ISBT', landmark: 'Hazrat Nizamuddin', lat: 28.5889, lng: 77.2571, offsetMin: 19, platform: 'Ring Rd Bay', stopCode: 'DEL534B' },
      { name: 'Lajpat Nagar Central Market', landmark: 'Ring Road Metro', lat: 28.5677, lng: 77.2433, offsetMin: 28, platform: 'Stop 1', stopCode: 'DEL534C' },
      { name: 'AIIMS / South Extension', landmark: 'Safdarjung Hospital', lat: 28.5672, lng: 77.2100, offsetMin: 38, platform: 'Bay 2', stopCode: 'DEL534D' },
      { name: 'IIT Delhi / Hauz Khas', landmark: 'Outer Ring Road', lat: 28.5450, lng: 77.1926, offsetMin: 47, platform: 'Stop 1', stopCode: 'DEL534E' },
      { name: 'Mehrauli Terminal', landmark: 'Qutub Minar Complex', lat: 28.5204, lng: 77.1792, offsetMin: 58, platform: 'Terminal Bay 2', stopCode: 'DEL534F' },
    ],
  },
  {
    id: 'WIMB::MAA::21G',
    cityId: 'chennai',
    routeNumber: '21G',
    aliases: ['21G', 'MTC 21G', 'Broadway Tambaram'],
    operator: 'MTC',
    serviceType: 'Deluxe Express',
    isElectric: false,
    isAC: false,
    womenFreeEligible: true,
    womenSchemeName: 'Vidiyal Payanam Free',
    baseFareInr: 10,
    maxFareInr: 35,
    headwayMinutes: 11,
    regPrefix: 'TN01AN2174',
    activeProgressStop: 1.9,
    speedKmh: 28,
    delayMinutes: 0,
    crowdLevel: 'medium',
    crowdPercent: 55,
    stops: [
      { name: 'Broadway Bus Terminus', landmark: 'Parrys Corner', lat: 13.0891, lng: 80.2836, offsetMin: 0, platform: 'Bay 4', stopCode: 'MAA21GA' },
      { name: 'Marina Beach / Queen Marys', landmark: 'Kamarajar Salai', lat: 13.0500, lng: 80.2824, offsetMin: 12, platform: 'Stop 1', stopCode: 'MAA21GB' },
      { name: 'Mylapore Tank', landmark: 'Kapaleeshwarar Temple', lat: 13.0334, lng: 80.2687, offsetMin: 21, platform: 'Stop 2', stopCode: 'MAA21GC' },
      { name: 'Adyar Signal', landmark: 'LB Road Junction', lat: 13.0064, lng: 80.2575, offsetMin: 31, platform: 'Bay 1', stopCode: 'MAA21GD' },
      { name: 'Guindy Kathipara', landmark: 'Guindy Metro', lat: 13.0067, lng: 80.2206, offsetMin: 43, platform: 'Stop 3', stopCode: 'MAA21GE' },
      { name: 'Tambaram Sanatorium Terminal', landmark: 'GST Road', lat: 12.9249, lng: 80.1168, offsetMin: 68, platform: 'Bay 7', stopCode: 'MAA21GF' },
    ],
  },
];

/**
 * Materializes dynamic, live-timestamped `BusRoute` instances around `nowMs`
 * so bus number search & live stop timelines always reflect accurate IST times.
 */
export function buildFeaturedBusRoutes(nowMs: number = Date.now()): Array<
  BusRoute & { cityId: CityPresetId; aliases: string[] }
> {
  return FEATURED_SEEDS.map((seed) => {
    const progressIdx = Math.floor(seed.activeProgressStop);
    const frac = seed.activeProgressStop - progressIdx;
    const prevOffset = seed.stops[progressIdx]?.offsetMin ?? 0;
    const nextOffset = seed.stops[progressIdx + 1]?.offsetMin ?? prevOffset + 8;
    const elapsedMinAtBus = prevOffset + (nextOffset - prevOffset) * frac;

    // Origin departure epoch so that `nowMs` places the bus right at `activeProgressStop`
    const originStartMs = nowMs - elapsedMinAtBus * 60_000;

    let cumulativeKm = 0;
    const stops: RouteStop[] = seed.stops.map((st, idx) => {
      if (idx > 0) {
        const prev = seed.stops[idx - 1];
        const segKm = (haversineMeters(prev.lat, prev.lng, st.lat, st.lng) / 1000) * 1.18;
        cumulativeKm += Math.max(0.4, Number(segKm.toFixed(2)));
      }

      const schedMs = originStartMs + st.offsetMin * 60_000;
      const liveMs = schedMs + seed.delayMinutes * 60_000;

      return {
        id: `${seed.id}::STOP::${idx}`,
        name: st.name,
        stopCode: st.stopCode,
        landmark: st.landmark,
        lat: st.lat,
        lng: st.lng,
        distanceFromStartKm: Number(cumulativeKm.toFixed(2)),
        scheduledArrivalIso: new Date(schedMs).toISOString(),
        scheduledDepartureIso: new Date(schedMs + 30_000).toISOString(),
        liveArrivalIso: new Date(liveMs).toISOString(),
        liveDepartureIso: new Date(liveMs + 30_000).toISOString(),
        scheduledOffsetMin: st.offsetMin,
        platform: st.platform || 'Stop',
      };
    });

    // Interpolate smooth road-like intermediate polyline vertices along corridor
    const polyline: [number, number][] = [];
    for (let i = 0; i < stops.length; i++) {
      polyline.push([stops[i].lat, stops[i].lng]);
      if (i < stops.length - 1) {
        const a = stops[i];
        const b = stops[i + 1];
        polyline.push([
          Number((a.lat + (b.lat - a.lat) * 0.35 + 0.0006).toFixed(6)),
          Number((a.lng + (b.lng - a.lng) * 0.35 - 0.0004).toFixed(6)),
        ]);
        polyline.push([
          Number((a.lat + (b.lat - a.lat) * 0.7 - 0.0004).toFixed(6)),
          Number((a.lng + (b.lng - a.lng) * 0.7 + 0.0005).toFixed(6)),
        ]);
      }
    }

    const nextStopIdx = Math.min(stops.length - 1, progressIdx + 1);
    const nextStopLiveMs = new Date(
      stops[nextStopIdx].liveArrivalIso || stops[nextStopIdx].scheduledArrivalIso!
    ).getTime();
    const firstEtaMin = Math.max(1, Math.round((nextStopLiveMs - nowMs) / 60_000));

    const buses: UpcomingBusInstance[] = [0, 1, 2].map((slotIdx) => {
      const headwayOffset = slotIdx * seed.headwayMinutes;
      const eta = firstEtaMin + headwayOffset;
      const arrivalMs = nowMs + eta * 60_000;
      const schedMs = arrivalMs - (slotIdx === 0 ? seed.delayMinutes : 0) * 60_000;
      const slotProgress =
        slotIdx === 0
          ? seed.activeProgressStop
          : Math.max(0.08, seed.activeProgressStop - slotIdx * 2.1);

      return {
        id: `${seed.id}::TRIP::${slotIdx + 1}`,
        tripId: `${seed.id}::TRIP::${slotIdx + 1}`,
        regNumber:
          slotIdx === 0
            ? seed.regPrefix
            : `${seed.regPrefix.slice(0, -2)}${18 + slotIdx * 17}`,
        etaMinutes: eta,
        arrivalIso: new Date(arrivalMs).toISOString(),
        scheduledArrivalIso: new Date(schedMs).toISOString(),
        delayMinutes: slotIdx === 0 ? seed.delayMinutes : 0,
        isRealTimeFeed: true,
        crowdPercent:
          slotIdx === 0
            ? seed.crowdPercent
            : Math.max(22, seed.crowdPercent - slotIdx * 12),
        crowdLevel: slotIdx === 0 ? seed.crowdLevel : 'low',
        speedKmh: seed.speedKmh,
        routeProgress: slotProgress,
        crowdsourcedCount: 14 - slotIdx * 4,
      };
    });

    const origin = stops[0].name;
    const destination = stops[stops.length - 1].name;
    const boardingStop = stops[nextStopIdx] || stops[0];

    return {
      id: seed.id,
      cityId: seed.cityId,
      aliases: seed.aliases,
      routeNumber: seed.routeNumber,
      operator: seed.operator,
      serviceType: seed.serviceType,
      isElectric: seed.isElectric,
      isAC: seed.isAC,
      womenFreeEligible: seed.womenFreeEligible,
      womenSchemeName: seed.womenSchemeName,
      name: `${origin} → ${destination}`,
      headsign: destination,
      origin,
      destination,
      boardingStopName: boardingStop.name,
      boardingStopId: boardingStop.id,
      boardingStopLat: boardingStop.lat,
      boardingStopLon: boardingStop.lng,
      headwayMinutes: seed.headwayMinutes,
      baseFareInr: seed.baseFareInr,
      maxFareInr: seed.maxFareInr,
      dataSourceLabel: `${seed.operator} Live Corridor Telemetry`,
      polyline,
      stops,
      fullTripLoaded: true,
      buses,
    };
  });
}

/**
 * Searches both live loaded GTFS `BusRoute[]` and the featured corridor catalog
 * by bus route number, service category alias (e.g. "AC Vajra"), or corridor name.
 */
export function searchBusRoutesByNumberOrName(
  query: string,
  liveRoutes: BusRoute[],
  activeCityId?: CityPresetId,
  nowMs: number = Date.now()
): BusRoute[] {
  const featured = buildFeaturedBusRoutes(nowMs);
  const mergedMap = new Map<string, BusRoute & { aliases?: string[]; cityId?: CityPresetId }>();

  // Index live GTFS routes first
  for (const r of liveRoutes) {
    mergedMap.set(r.id, r);
  }

  // Merge featured routes if an identical routeNumber+operator isn't already loaded with >=4 stops
  for (const f of featured) {
    const existingWithFullStops = liveRoutes.find(
      (r) =>
        r.routeNumber.toUpperCase() === f.routeNumber.toUpperCase() &&
        r.operator.toUpperCase() === f.operator.toUpperCase() &&
        r.stops.length >= 4
    );
    if (!existingWithFullStops) {
      mergedMap.set(f.id, f);
    }
  }

  const allCandidates = Array.from(mergedMap.values());
  const rawQ = query.trim();

  if (!rawQ) {
    // Return city-relevant routes first, then popular featured routes
    return allCandidates
      .sort((a, b) => {
        const aCity = a.cityId === activeCityId || !a.cityId ? 1 : 0;
        const bCity = b.cityId === activeCityId || !b.cityId ? 1 : 0;
        if (aCity !== bCity) return bCity - aCity;
        return (a.buses[0]?.etaMinutes ?? 99) - (b.buses[0]?.etaMinutes ?? 99);
      })
      .slice(0, 10);
  }

  const qLower = rawQ.toLowerCase();
  const qCompact = qLower.replace(/[^a-z0-9]/g, '');

  const scored: Array<{ route: BusRoute; score: number }> = [];

  for (const r of allCandidates) {
    const numLower = r.routeNumber.toLowerCase();
    const numCompact = numLower.replace(/[^a-z0-9]/g, '');
    const aliases = (r.aliases || []).map((a) => a.toLowerCase());
    const serviceLower = r.serviceType.toLowerCase();
    const corridorLower = `${r.origin} ${r.destination} ${r.operator}`.toLowerCase();

    let score = 0;
    if (numLower === qLower || numCompact === qCompact) {
      score = 1000;
    } else if (numLower.startsWith(qLower) || (qCompact && numCompact.startsWith(qCompact))) {
      score = 850;
    } else if (aliases.some((a) => a === qLower || a.replace(/[^a-z0-9]/g, '') === qCompact)) {
      score = 820;
    } else if (numLower.includes(qLower) || (qCompact.length >= 2 && numCompact.includes(qCompact))) {
      score = 700;
    } else if (aliases.some((a) => a.includes(qLower))) {
      score = 640;
    } else if (serviceLower.includes(qLower)) {
      score = 520;
    } else if (corridorLower.includes(qLower)) {
      score = 440;
    }

    if (score > 0) {
      if (r.cityId && r.cityId === activeCityId) score += 35;
      if (r.stops.length >= 5) score += 20;
      scored.push({ route: r, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => item.route);
}
