/**
 * Golf Region Definitions  
 * 100 MSAs + 50 State Fallbacks
 * Used for geolocation-based content filtering and organization
 */

export interface Region {
  // Keys (backend only - users never see these)
  key: string;
  country: string;
  state: string;
  states?: string[];
  
  // Display (user-facing)
  displayName: string;
  officialMSAName: string;
  
  // Cities covered
  primaryCity: string;
  majorCities: string[];
  
  // Geographic (for matching)
  centerPoint: { lat: number; lon: number };
  geohashPrefixes: string[];
  radiusMiles: number;
  
  // Metadata
  timezone: string;
  msaCode?: string;
  population?: number;
  isMultiState: boolean;
  isFallback?: boolean;
}

/**
 * All 100 MSAs + 50 State Fallbacks
 * Organized by tier but exported as single array for easy querying
 */
export const REGIONS: Region[] = [
  
  // =================================================================
  // TIER 1: MAJOR GOLF MARKETS (30 MSAs)
  // Top population centers with strong golf culture
  // =================================================================
  
  {
    key: "us_ny_nyc",
    country: "us",
    state: "ny",
    states: ["ny", "nj", "pa"],
    displayName: "New York Metro, NY-NJ-PA",
    officialMSAName: "New York-Newark-Jersey City, NY-NJ-PA Metropolitan Statistical Area",
    primaryCity: "New York",
    majorCities: ["New York", "Newark", "Jersey City", "Yonkers", "Paterson"],
    centerPoint: { lat: 40.7128, lon: -74.0060 },
    geohashPrefixes: ["dr5r", "dr5x", "dr72", "drt2", "drt8"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "35620",
    population: 19200000,
    isMultiState: true,
  },
  
  {
    key: "us_ca_la",
    country: "us",
    state: "ca",
    displayName: "Los Angeles Metro, CA",
    officialMSAName: "Los Angeles-Long Beach-Anaheim, CA Metropolitan Statistical Area",
    primaryCity: "Los Angeles",
    majorCities: ["Los Angeles", "Long Beach", "Anaheim", "Glendale", "Santa Ana"],
    centerPoint: { lat: 34.0522, lon: -118.2437 },
    geohashPrefixes: ["9q5c", "9q5f", "9q5b", "9q60", "9q3p"],
    radiusMiles: 50,
    timezone: "America/Los_Angeles",
    msaCode: "31080",
    population: 13200000,
    isMultiState: false,
  },

  {
    key: "us_il_chicago",
    country: "us",
    state: "il",
    states: ["il", "in", "wi"],
    displayName: "Chicago Metro, IL-IN-WI",
    officialMSAName: "Chicago-Naperville-Elgin, IL-IN-WI Metropolitan Statistical Area",
    primaryCity: "Chicago",
    majorCities: ["Chicago", "Naperville", "Elgin", "Aurora", "Joliet"],
    centerPoint: { lat: 41.8781, lon: -87.6298 },
    geohashPrefixes: ["dp3w", "dp3t", "dp3v", "dp3y", "dp3s"],
    radiusMiles: 50,
    timezone: "America/Chicago",
    msaCode: "16980",
    population: 9600000,
    isMultiState: true,
  },

  {
    key: "us_tx_dfw",
    country: "us",
    state: "tx",
    displayName: "Dallas-Fort Worth, TX",
    officialMSAName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    primaryCity: "Dallas",
    majorCities: ["Dallas", "Fort Worth", "Arlington", "Plano", "Irving"],
    centerPoint: { lat: 32.7767, lon: -96.7970 },
    geohashPrefixes: ["9vg4", "9vg6", "9vg7", "9vg1", "9vg3"],
    radiusMiles: 50,
    timezone: "America/Chicago",
    msaCode: "19100",
    population: 7800000,
    isMultiState: false,
  },

  {
    key: "us_tx_houston",
    country: "us",
    state: "tx",
    displayName: "Houston Metro, TX",
    officialMSAName: "Houston-The Woodlands-Sugar Land, TX Metropolitan Statistical Area",
    primaryCity: "Houston",
    majorCities: ["Houston", "The Woodlands", "Sugar Land", "Pasadena", "Pearland"],
    centerPoint: { lat: 29.7604, lon: -95.3698 },
    geohashPrefixes: ["9vk1", "9vk4", "9vk0", "9v6y", "9v6v"],
    radiusMiles: 50,
    timezone: "America/Chicago",
    msaCode: "26420",
    population: 7100000,
    isMultiState: false,
  },

  {
    key: "us_az_phoenix",
    country: "us",
    state: "az",
    displayName: "Phoenix Metro, AZ",
    officialMSAName: "Phoenix-Mesa-Chandler, AZ Metropolitan Statistical Area",
    primaryCity: "Phoenix",
    majorCities: ["Phoenix", "Mesa", "Chandler", "Scottsdale", "Glendale"],
    centerPoint: { lat: 33.4484, lon: -112.0740 },
    geohashPrefixes: ["9tbw", "9tby", "9tbv", "9tbt", "9tbq"],
    radiusMiles: 50,
    timezone: "America/Phoenix",
    msaCode: "38060",
    population: 4900000,
    isMultiState: false,
  },

  {
    key: "us_pa_philly",
    country: "us",
    state: "pa",
    states: ["pa", "nj", "de", "md"],
    displayName: "Philadelphia Metro, PA-NJ-DE-MD",
    officialMSAName: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD Metropolitan Statistical Area",
    primaryCity: "Philadelphia",
    majorCities: ["Philadelphia", "Camden", "Wilmington", "Reading", "Chester"],
    centerPoint: { lat: 39.9526, lon: -75.1652 },
    geohashPrefixes: ["dr4d", "dr4f", "dr4c", "dr4e", "dr49"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "37980",
    population: 6200000,
    isMultiState: true,
  },

  {
    key: "us_ca_bayarea",
    country: "us",
    state: "ca",
    displayName: "Bay Area, CA",
    officialMSAName: "San Francisco-Oakland-Berkeley, CA Metropolitan Statistical Area",
    primaryCity: "San Francisco",
    majorCities: ["San Francisco", "Oakland", "Berkeley", "San Jose", "Fremont"],
    centerPoint: { lat: 37.7749, lon: -122.4194 },
    geohashPrefixes: ["9q8y", "9q8z", "9q8v", "9q8w", "9q9p"],
    radiusMiles: 50,
    timezone: "America/Los_Angeles",
    msaCode: "41860",
    population: 4700000,
    isMultiState: false,
  },

  {
    key: "us_ga_atlanta",
    country: "us",
    state: "ga",
    displayName: "Atlanta Metro, GA",
    officialMSAName: "Atlanta-Sandy Springs-Alpharetta, GA Metropolitan Statistical Area",
    primaryCity: "Atlanta",
    majorCities: ["Atlanta", "Sandy Springs", "Alpharetta", "Marietta", "Roswell"],
    centerPoint: { lat: 33.7490, lon: -84.3880 },
    geohashPrefixes: ["dn5h", "dn5k", "dn5m", "dn5s", "dn5j"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "12060",
    population: 6100000,
    isMultiState: false,
  },

  {
    key: "us_fl_miami",
    country: "us",
    state: "fl",
    displayName: "Miami Metro, FL",
    officialMSAName: "Miami-Fort Lauderdale-Pompano Beach, FL Metropolitan Statistical Area",
    primaryCity: "Miami",
    majorCities: ["Miami", "Fort Lauderdale", "Pompano Beach", "Hialeah", "Hollywood"],
    centerPoint: { lat: 25.7617, lon: -80.1918 },
    geohashPrefixes: ["dhwm", "dhwt", "dhwq", "dhww", "dhwk"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "33100",
    population: 6200000,
    isMultiState: false,
  },

  {
    key: "us_ma_boston",
    country: "us",
    state: "ma",
    states: ["ma", "nh"],
    displayName: "Boston Metro, MA-NH",
    officialMSAName: "Boston-Cambridge-Newton, MA-NH Metropolitan Statistical Area",
    primaryCity: "Boston",
    majorCities: ["Boston", "Cambridge", "Newton", "Quincy", "Lynn"],
    centerPoint: { lat: 42.3601, lon: -71.0589 },
    geohashPrefixes: ["drt2", "drt8", "drt3", "drt9", "drtd"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "14460",
    population: 4900000,
    isMultiState: true,
  },

  {
    key: "us_ca_inlandempire",
    country: "us",
    state: "ca",
    displayName: "Riverside-San Bernardino, CA",
    officialMSAName: "Riverside-San Bernardino-Ontario, CA Metropolitan Statistical Area",
    primaryCity: "Riverside",
    majorCities: ["Riverside", "San Bernardino", "Ontario", "Fontana", "Moreno Valley"],
    centerPoint: { lat: 33.9533, lon: -117.3962 },
    geohashPrefixes: ["9mud", "9muf", "9muc", "9mu9", "9mu6"],
    radiusMiles: 50,
    timezone: "America/Los_Angeles",
    msaCode: "40140",
    population: 4600000,
    isMultiState: false,
  },

  {
    key: "us_mi_detroit",
    country: "us",
    state: "mi",
    displayName: "Detroit Metro, MI",
    officialMSAName: "Detroit-Warren-Dearborn, MI Metropolitan Statistical Area",
    primaryCity: "Detroit",
    majorCities: ["Detroit", "Warren", "Dearborn", "Sterling Heights", "Ann Arbor"],
    centerPoint: { lat: 42.3314, lon: -83.0458 },
    geohashPrefixes: ["dpsh", "dpsj", "dpsk", "dps7", "dps5"],
    radiusMiles: 50,
    timezone: "America/Detroit",
    msaCode: "19820",
    population: 4300000,
    isMultiState: false,
  },

  {
    key: "us_wa_seattle",
    country: "us",
    state: "wa",
    displayName: "Seattle Metro, WA",
    officialMSAName: "Seattle-Tacoma-Bellevue, WA Metropolitan Statistical Area",
    primaryCity: "Seattle",
    majorCities: ["Seattle", "Tacoma", "Bellevue", "Everett", "Kent"],
    centerPoint: { lat: 47.6062, lon: -122.3321 },
    geohashPrefixes: ["c23n", "c23p", "c23q", "c23j", "c23m"],
    radiusMiles: 50,
    timezone: "America/Los_Angeles",
    msaCode: "42660",
    population: 4000000,
    isMultiState: false,
  },

  {
    key: "us_mn_twincities",
    country: "us",
    state: "mn",
    states: ["mn", "wi"],
    displayName: "Minneapolis-St. Paul, MN-WI",
    officialMSAName: "Minneapolis-St. Paul-Bloomington, MN-WI Metropolitan Statistical Area",
    primaryCity: "Minneapolis",
    majorCities: ["Minneapolis", "St. Paul", "Bloomington", "Rochester", "Duluth"],
    centerPoint: { lat: 44.9778, lon: -93.2650 },
    geohashPrefixes: ["9zvw", "9zvn", "9zvt", "9zvq", "9zvx"],
    radiusMiles: 50,
    timezone: "America/Chicago",
    msaCode: "33460",
    population: 3700000,
    isMultiState: true,
  },

  {
    key: "us_ca_sandiego",
    country: "us",
    state: "ca",
    displayName: "San Diego, CA",
    officialMSAName: "San Diego-Chula Vista-Carlsbad, CA Metropolitan Statistical Area",
    primaryCity: "San Diego",
    majorCities: ["San Diego", "Chula Vista", "Carlsbad", "Oceanside", "El Cajon"],
    centerPoint: { lat: 32.7157, lon: -117.1611 },
    geohashPrefixes: ["9mug", "9mue", "9mu7", "9mu5", "9mu4"],
    radiusMiles: 50,
    timezone: "America/Los_Angeles",
    msaCode: "41740",
    population: 3300000,
    isMultiState: false,
  },

  {
    key: "us_fl_tampabay",
    country: "us",
    state: "fl",
    displayName: "Tampa Bay, FL",
    officialMSAName: "Tampa-St. Petersburg-Clearwater, FL Metropolitan Statistical Area",
    primaryCity: "Tampa",
    majorCities: ["Tampa", "St. Petersburg", "Clearwater", "Largo", "Brandon"],
    centerPoint: { lat: 27.9506, lon: -82.4572 },
    geohashPrefixes: ["dhz4", "dhz6", "dhz1", "dhz3", "dhyd"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "45300",
    population: 3200000,
    isMultiState: false,
  },

  {
    key: "us_co_denver",
    country: "us",
    state: "co",
    displayName: "Denver Metro, CO",
    officialMSAName: "Denver-Aurora-Lakewood, CO Metropolitan Statistical Area",
    primaryCity: "Denver",
    majorCities: ["Denver", "Aurora", "Lakewood", "Boulder", "Fort Collins"],
    centerPoint: { lat: 39.7392, lon: -104.9903 },
    geohashPrefixes: ["9xj6", "9xj7", "9xj4", "9xj5", "9xjd"],
    radiusMiles: 50,
    timezone: "America/Denver",
    msaCode: "19740",
    population: 3000000,
    isMultiState: false,
  },

  {
    key: "us_mo_stlouis",
    country: "us",
    state: "mo",
    states: ["mo", "il"],
    displayName: "St. Louis, MO-IL",
    officialMSAName: "St. Louis, MO-IL Metropolitan Statistical Area",
    primaryCity: "St. Louis",
    majorCities: ["St. Louis", "St. Charles", "O'Fallon", "St. Peters", "Florissant"],
    centerPoint: { lat: 38.6270, lon: -90.1994 },
    geohashPrefixes: ["9yzf", "9yzg", "9yzd", "9yze", "9yzc"],
    radiusMiles: 50,
    timezone: "America/Chicago",
    msaCode: "41180",
    population: 2800000,
    isMultiState: true,
  },

  {
    key: "us_md_baltimore",
    country: "us",
    state: "md",
    displayName: "Baltimore Metro, MD",
    officialMSAName: "Baltimore-Columbia-Towson, MD Metropolitan Statistical Area",
    primaryCity: "Baltimore",
    majorCities: ["Baltimore", "Columbia", "Towson", "Glen Burnie", "Dundalk"],
    centerPoint: { lat: 39.2904, lon: -76.6122 },
    geohashPrefixes: ["dqcj", "dqck", "dqcm", "dqch", "dqce"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "12580",
    population: 2800000,
    isMultiState: false,
  },

  {
    key: "us_nc_charlotte",
    country: "us",
    state: "nc",
    states: ["nc", "sc"],
    displayName: "Charlotte Metro, NC-SC",
    officialMSAName: "Charlotte-Concord-Gastonia, NC-SC Metropolitan Statistical Area",
    primaryCity: "Charlotte",
    majorCities: ["Charlotte", "Concord", "Gastonia", "Rock Hill", "Huntersville"],
    centerPoint: { lat: 35.2271, lon: -80.8431 },
    geohashPrefixes: ["dnq8", "dnq9", "dnqb", "dnqd", "dnq3"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "16740",
    population: 2700000,
    isMultiState: true,
  },

  {
    key: "us_fl_orlando",
    country: "us",
    state: "fl",
    displayName: "Orlando Metro, FL",
    officialMSAName: "Orlando-Kissimmee-Sanford, FL Metropolitan Statistical Area",
    primaryCity: "Orlando",
    majorCities: ["Orlando", "Kissimmee", "Sanford", "Lake Mary", "Winter Park"],
    centerPoint: { lat: 28.5383, lon: -81.3792 },
    geohashPrefixes: ["djn5", "djn4", "djn6", "djn1", "djn3"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "36740",
    population: 2700000,
    isMultiState: false,
  },

  {
    key: "us_tx_sanantonio",
    country: "us",
    state: "tx",
    displayName: "San Antonio, TX",
    officialMSAName: "San Antonio-New Braunfels, TX Metropolitan Statistical Area",
    primaryCity: "San Antonio",
    majorCities: ["San Antonio", "New Braunfels", "Converse", "Universal City", "Live Oak"],
    centerPoint: { lat: 29.4241, lon: -98.4936 },
    geohashPrefixes: ["9v6j", "9v6m", "9v6n", "9v6h", "9v6k"],
    radiusMiles: 50,
    timezone: "America/Chicago",
    msaCode: "41700",
    population: 2600000,
    isMultiState: false,
  },

  {
    key: "us_or_portland",
    country: "us",
    state: "or",
    states: ["or", "wa"],
    displayName: "Portland Metro, OR-WA",
    officialMSAName: "Portland-Vancouver-Hillsboro, OR-WA Metropolitan Statistical Area",
    primaryCity: "Portland",
    majorCities: ["Portland", "Vancouver", "Hillsboro", "Beaverton", "Gresham"],
    centerPoint: { lat: 45.5152, lon: -122.6784 },
    geohashPrefixes: ["c216", "c217", "c214", "c215", "c20p"],
    radiusMiles: 50,
    timezone: "America/Los_Angeles",
    msaCode: "38900",
    population: 2500000,
    isMultiState: true,
  },

  {
    key: "us_ca_sacramento",
    country: "us",
    state: "ca",
    displayName: "Sacramento, CA",
    officialMSAName: "Sacramento-Roseville-Folsom, CA Metropolitan Statistical Area",
    primaryCity: "Sacramento",
    majorCities: ["Sacramento", "Roseville", "Folsom", "Elk Grove", "Citrus Heights"],
    centerPoint: { lat: 38.5816, lon: -121.4944 },
    geohashPrefixes: ["9qe7", "9qe5", "9qe6", "9qe4", "9qed"],
    radiusMiles: 50,
    timezone: "America/Los_Angeles",
    msaCode: "40900",
    population: 2400000,
    isMultiState: false,
  },

  {
    key: "us_pa_pittsburgh",
    country: "us",
    state: "pa",
    displayName: "Pittsburgh Metro, PA",
    officialMSAName: "Pittsburgh, PA Metropolitan Statistical Area",
    primaryCity: "Pittsburgh",
    majorCities: ["Pittsburgh", "McKeesport", "Bethel Park", "Mount Lebanon", "Ross Township"],
    centerPoint: { lat: 40.4406, lon: -79.9959 },
    geohashPrefixes: ["dppn", "dppp", "dppq", "dppj", "dppm"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "38300",
    population: 2300000,
    isMultiState: false,
  },

  {
    key: "us_nv_lasvegas",
    country: "us",
    state: "nv",
    displayName: "Las Vegas, NV",
    officialMSAName: "Las Vegas-Henderson-Paradise, NV Metropolitan Statistical Area",
    primaryCity: "Las Vegas",
    majorCities: ["Las Vegas", "Henderson", "Paradise", "North Las Vegas", "Summerlin"],
    centerPoint: { lat: 36.1699, lon: -115.1398 },
    geohashPrefixes: ["9qqh", "9qqk", "9qq5", "9qq7", "9qqe"],
    radiusMiles: 50,
    timezone: "America/Los_Angeles",
    msaCode: "29820",
    population: 2300000,
    isMultiState: false,
  },

  {
    key: "us_tx_austin",
    country: "us",
    state: "tx",
    displayName: "Austin, TX",
    officialMSAName: "Austin-Round Rock-Georgetown, TX Metropolitan Statistical Area",
    primaryCity: "Austin",
    majorCities: ["Austin", "Round Rock", "Georgetown", "Cedar Park", "Pflugerville"],
    centerPoint: { lat: 30.2672, lon: -97.7431 },
    geohashPrefixes: ["9v6m", "9v6q", "9v6w", "9v6k", "9v6t"],
    radiusMiles: 50,
    timezone: "America/Chicago",
    msaCode: "12420",
    population: 2300000,
    isMultiState: false,
  },

  {
    key: "us_oh_cincinnati",
    country: "us",
    state: "oh",
    states: ["oh", "ky", "in"],
    displayName: "Cincinnati Metro, OH-KY-IN",
    officialMSAName: "Cincinnati, OH-KY-IN Metropolitan Statistical Area",
    primaryCity: "Cincinnati",
    majorCities: ["Cincinnati", "Covington", "Newport", "Mason", "Fairfield"],
    centerPoint: { lat: 39.1031, lon: -84.5120 },
    geohashPrefixes: ["dph8", "dphb", "dph9", "dph2", "dph3"],
    radiusMiles: 50,
    timezone: "America/New_York",
    msaCode: "17140",
    population: 2200000,
    isMultiState: true,
  },

  {
    key: "us_mo_kansascity",
    country: "us",
    state: "mo",
    states: ["mo", "ks"],
    displayName: "Kansas City, MO-KS",
    officialMSAName: "Kansas City, MO-KS Metropolitan Statistical Area",
    primaryCity: "Kansas City",
    majorCities: ["Kansas City", "Overland Park", "Olathe", "Independence", "Lee's Summit"],
    centerPoint: { lat: 39.0997, lon: -94.5786 },
    geohashPrefixes: ["9yum", "9yun", "9yut", "9yuq", "9yuj"],
    radiusMiles: 50,
    timezone: "America/Chicago",
    msaCode: "28140",
    population: 2200000,
    isMultiState: true,
  },

  {
    key: "us_dc_washington",
    country: "us",
    state: "dc",
    states: ["dc", "va", "md"],
    displayName: "Washington DC Metro, DC-VA-MD",
    officialMSAName: "Washington-Arlington-Alexandria, DC-VA-MD-WV Metropolitan Statistical Area",
    primaryCity: "Washington",
    majorCities: ["Washington", "Arlington", "Alexandria", "Bethesda", "Silver Spring"],
    centerPoint: { lat: 38.9072, lon: -77.0369 },
    geohashPrefixes: ["dqcj", "dqck", "dqcm", "dqch", "dqce"],
    radiusMiles: 45,
    timezone: "America/New_York",
    msaCode: "47900",
    population: 6400000,
    isMultiState: true,
  },

  // =================================================================
  // TIER 2: GOLF DESTINATIONS (20 MSAs)
  // Known for golf tourism, courses, and golf culture
  // =================================================================

  {
    key: "us_az_scottsdale",
    country: "us",
    state: "az",
    displayName: "Scottsdale, AZ",
    officialMSAName: "Scottsdale Metropolitan Area",
    primaryCity: "Scottsdale",
    majorCities: ["Scottsdale", "Paradise Valley", "Fountain Hills"],
    centerPoint: { lat: 33.4942, lon: -111.9261 },
    geohashPrefixes: ["9tbu", "9tbv", "9tbs", "9tbt", "9tbg"],
    radiusMiles: 30,
    timezone: "America/Phoenix",
    population: 260000,
    isMultiState: false,
  },

  {
    key: "us_ca_palmsprings",
    country: "us",
    state: "ca",
    displayName: "Palm Springs, CA",
    officialMSAName: "Palm Springs-Palm Desert-Cathedral City Metropolitan Area",
    primaryCity: "Palm Springs",
    majorCities: ["Palm Springs", "Palm Desert", "Cathedral City", "Rancho Mirage", "Indian Wells"],
    centerPoint: { lat: 33.8303, lon: -116.5453 },
    geohashPrefixes: ["9mwj", "9mwm", "9mwh", "9mwk", "9mw5"],
    radiusMiles: 30,
    timezone: "America/Los_Angeles",
    population: 360000,
    isMultiState: false,
  },

  {
    key: "us_fl_naples",
    country: "us",
    state: "fl",
    displayName: "Naples, FL",
    officialMSAName: "Naples-Marco Island, FL Metropolitan Statistical Area",
    primaryCity: "Naples",
    majorCities: ["Naples", "Marco Island", "Bonita Springs", "Estero"],
    centerPoint: { lat: 26.1420, lon: -81.7948 },
    geohashPrefixes: ["dhuf", "dhug", "dhud", "dhue", "dhuc"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "34940",
    population: 390000,
    isMultiState: false,
  },

  {
    key: "us_nc_sandhills",
    country: "us",
    state: "nc",
    displayName: "Sandhills, NC",
    officialMSAName: "Pinehurst-Southern Pines Metropolitan Area",
    primaryCity: "Pinehurst",
    majorCities: ["Pinehurst", "Southern Pines", "Aberdeen", "Whispering Pines"],
    centerPoint: { lat: 35.1954, lon: -79.4697 },
    geohashPrefixes: ["dnr8", "dnr9", "dnrb", "dnr2", "dnr3"],
    radiusMiles: 25,
    timezone: "America/New_York",
    population: 95000,
    isMultiState: false,
  },

  {
    key: "us_sc_myrtlebeach",
    country: "us",
    state: "sc",
    displayName: "Myrtle Beach, SC",
    officialMSAName: "Myrtle Beach-Conway-North Myrtle Beach, SC Metropolitan Statistical Area",
    primaryCity: "Myrtle Beach",
    majorCities: ["Myrtle Beach", "Conway", "North Myrtle Beach", "Surfside Beach"],
    centerPoint: { lat: 33.6891, lon: -78.8867 },
    geohashPrefixes: ["dnh8", "dnh9", "dnhb", "dnh2", "dnh3"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "34820",
    population: 480000,
    isMultiState: false,
  },

  {
    key: "us_sc_hiltonhead",
    country: "us",
    state: "sc",
    displayName: "Hilton Head Island, SC",
    officialMSAName: "Hilton Head Island-Bluffton, SC Metropolitan Statistical Area",
    primaryCity: "Hilton Head Island",
    majorCities: ["Hilton Head Island", "Bluffton", "Beaufort"],
    centerPoint: { lat: 32.2163, lon: -80.7526 },
    geohashPrefixes: ["djy4", "djy6", "djy7", "djy1", "djy3"],
    radiusMiles: 25,
    timezone: "America/New_York",
    msaCode: "25940",
    population: 220000,
    isMultiState: false,
  },

  {
    key: "us_ca_monterey",
    country: "us",
    state: "ca",
    displayName: "Monterey-Carmel, CA",
    officialMSAName: "Monterey-Salinas-Seaside, CA Metropolitan Statistical Area",
    primaryCity: "Monterey",
    majorCities: ["Monterey", "Carmel", "Salinas", "Seaside", "Pebble Beach"],
    centerPoint: { lat: 36.6002, lon: -121.8947 },
    geohashPrefixes: ["9q46", "9q47", "9q44", "9q45", "9q4d"],
    radiusMiles: 30,
    timezone: "America/Los_Angeles",
    msaCode: "34900",
    population: 440000,
    isMultiState: false,
  },

  {
    key: "us_fl_palmbeach",
    country: "us",
    state: "fl",
    displayName: "Palm Beach, FL",
    officialMSAName: "West Palm Beach-Boca Raton-Boynton Beach, FL Metropolitan Division",
    primaryCity: "West Palm Beach",
    majorCities: ["West Palm Beach", "Boca Raton", "Boynton Beach", "Palm Beach Gardens"],
    centerPoint: { lat: 26.7153, lon: -80.0534 },
    geohashPrefixes: ["dhyn", "dhyp", "dhyq", "dhyj", "dhym"],
    radiusMiles: 30,
    timezone: "America/New_York",
    population: 1500000,
    isMultiState: false,
  },

  {
    key: "us_fl_sarasota",
    country: "us",
    state: "fl",
    displayName: "Sarasota, FL",
    officialMSAName: "Sarasota-Bradenton-Venice, FL Metropolitan Statistical Area",
    primaryCity: "Sarasota",
    majorCities: ["Sarasota", "Bradenton", "Venice", "North Port", "Lakewood Ranch"],
    centerPoint: { lat: 27.3364, lon: -82.5307 },
    geohashPrefixes: ["dhyh", "dhyk", "dhys", "dhye", "dhyg"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "42680",
    population: 840000,
    isMultiState: false,
  },

  {
    key: "us_fl_fortmyers",
    country: "us",
    state: "fl",
    displayName: "Fort Myers, FL",
    officialMSAName: "Cape Coral-Fort Myers, FL Metropolitan Statistical Area",
    primaryCity: "Fort Myers",
    majorCities: ["Fort Myers", "Cape Coral", "Lehigh Acres", "Estero", "Bonita Springs"],
    centerPoint: { lat: 26.6406, lon: -81.8723 },
    geohashPrefixes: ["dhug", "dhuf", "dhue", "dhud", "dhut"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "15980",
    population: 790000,
    isMultiState: false,
  },

  {
    key: "us_fl_destin",
    country: "us",
    state: "fl",
    displayName: "Destin, FL",
    officialMSAName: "Crestview-Fort Walton Beach-Destin, FL Metropolitan Statistical Area",
    primaryCity: "Destin",
    majorCities: ["Destin", "Fort Walton Beach", "Crestview", "Niceville"],
    centerPoint: { lat: 30.3935, lon: -86.4958 },
    geohashPrefixes: ["djg3", "djg9", "djg2", "djg8", "djgb"],
    radiusMiles: 30,
    timezone: "America/Chicago",
    msaCode: "18880",
    population: 280000,
    isMultiState: false,
  },

  {
    key: "us_sc_kiawah",
    country: "us",
    state: "sc",
    displayName: "Kiawah Island, SC",
    officialMSAName: "Charleston-North Charleston Metropolitan Statistical Area",
    primaryCity: "Kiawah Island",
    majorCities: ["Kiawah Island", "Seabrook Island", "Johns Island"],
    centerPoint: { lat: 32.6085, lon: -80.0844 },
    geohashPrefixes: ["djzh", "djzk", "djzm", "djz5", "djz7"],
    radiusMiles: 20,
    timezone: "America/New_York",
    population: 2000,
    isMultiState: false,
  },

  {
    key: "us_ga_seaisland",
    country: "us",
    state: "ga",
    displayName: "Sea Island, GA",
    officialMSAName: "Brunswick Metropolitan Statistical Area",
    primaryCity: "Sea Island",
    majorCities: ["Sea Island", "St. Simons Island", "Brunswick"],
    centerPoint: { lat: 31.1316, lon: -81.3884 },
    geohashPrefixes: ["djw8", "djw9", "djwb", "djw2", "djw3"],
    radiusMiles: 20,
    timezone: "America/New_York",
    msaCode: "15260",
    population: 120000,
    isMultiState: false,
  },

  {
    key: "us_ca_palmdesert",
    country: "us",
    state: "ca",
    displayName: "Palm Desert, CA",
    officialMSAName: "Coachella Valley Metropolitan Area",
    primaryCity: "Palm Desert",
    majorCities: ["Palm Desert", "La Quinta", "Indio", "Coachella"],
    centerPoint: { lat: 33.7222, lon: -116.3753 },
    geohashPrefixes: ["9mwn", "9mwq", "9mwp", "9mwj", "9mwm"],
    radiusMiles: 25,
    timezone: "America/Los_Angeles",
    population: 180000,
    isMultiState: false,
  },

  {
    key: "us_fl_jacksonville",
    country: "us",
    state: "fl",
    displayName: "Jacksonville, FL",
    officialMSAName: "Jacksonville, FL Metropolitan Statistical Area",
    primaryCity: "Jacksonville",
    majorCities: ["Jacksonville", "St. Augustine", "Ponte Vedra Beach", "Orange Park"],
    centerPoint: { lat: 30.3322, lon: -81.6557 },
    geohashPrefixes: ["djuq", "djur", "djux", "djup", "djuw"],
    radiusMiles: 40,
    timezone: "America/New_York",
    msaCode: "27260",
    population: 1600000,
    isMultiState: false,
  },

  {
    key: "us_az_tucson",
    country: "us",
    state: "az",
    displayName: "Tucson, AZ",
    officialMSAName: "Tucson, AZ Metropolitan Statistical Area",
    primaryCity: "Tucson",
    majorCities: ["Tucson", "Oro Valley", "Marana", "Sahuarita"],
    centerPoint: { lat: 32.2226, lon: -110.9747 },
    geohashPrefixes: ["9tef", "9teg", "9ted", "9tee", "9te7"],
    radiusMiles: 40,
    timezone: "America/Phoenix",
    msaCode: "46060",
    population: 1100000,
    isMultiState: false,
  },

  {
    key: "us_ga_augusta",
    country: "us",
    state: "ga",
    states: ["ga", "sc"],
    displayName: "Augusta, GA-SC",
    officialMSAName: "Augusta-Richmond County, GA-SC Metropolitan Statistical Area",
    primaryCity: "Augusta",
    majorCities: ["Augusta", "Evans", "Martinez", "Aiken"],
    centerPoint: { lat: 33.4735, lon: -82.0105 },
    geohashPrefixes: ["djxm", "djxq", "djxt", "djxj", "djxn"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "12260",
    population: 610000,
    isMultiState: true,
  },

  {
    key: "us_sc_charleston",
    country: "us",
    state: "sc",
    displayName: "Charleston, SC",
    officialMSAName: "Charleston-North Charleston, SC Metropolitan Statistical Area",
    primaryCity: "Charleston",
    majorCities: ["Charleston", "North Charleston", "Mount Pleasant", "Summerville"],
    centerPoint: { lat: 32.7765, lon: -79.9311 },
    geohashPrefixes: ["djzj", "djzm", "djzn", "djzh", "djzk"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "16700",
    population: 810000,
    isMultiState: false,
  },

  {
    key: "us_ga_savannah",
    country: "us",
    state: "ga",
    displayName: "Savannah, GA",
    officialMSAName: "Savannah, GA Metropolitan Statistical Area",
    primaryCity: "Savannah",
    majorCities: ["Savannah", "Pooler", "Hinesville", "Richmond Hill"],
    centerPoint: { lat: 32.0809, lon: -81.0912 },
    geohashPrefixes: ["djwf", "djwg", "djwd", "djwe", "djw7"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "42340",
    population: 400000,
    isMultiState: false,
  },

  {
    key: "us_nc_asheville",
    country: "us",
    state: "nc",
    displayName: "Asheville, NC",
    officialMSAName: "Asheville, NC Metropolitan Statistical Area",
    primaryCity: "Asheville",
    majorCities: ["Asheville", "Hendersonville", "Black Mountain", "Brevard"],
    centerPoint: { lat: 35.5951, lon: -82.5515 },
    geohashPrefixes: ["dnk5", "dnk7", "dnk4", "dnk6", "dnkh"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "11700",
    population: 470000,
    isMultiState: false,
  },

  // =================================================================
  // TIER 3: REGIONAL HUBS (30 MSAs)
  // Cover remaining population centers
  // =================================================================

  {
    key: "us_oh_columbus",
    country: "us",
    state: "oh",
    displayName: "Columbus, OH",
    officialMSAName: "Columbus, OH Metropolitan Statistical Area",
    primaryCity: "Columbus",
    majorCities: ["Columbus", "Dublin", "Westerville", "Grove City", "Reynoldsburg"],
    centerPoint: { lat: 39.9612, lon: -82.9988 },
    geohashPrefixes: ["dph3", "dph6", "dph7", "dph4", "dph9"],
    radiusMiles: 40,
    timezone: "America/New_York",
    msaCode: "18140",
    population: 2200000,
    isMultiState: false,
  },

  {
    key: "us_in_indianapolis",
    country: "us",
    state: "in",
    displayName: "Indianapolis, IN",
    officialMSAName: "Indianapolis-Carmel-Anderson, IN Metropolitan Statistical Area",
    primaryCity: "Indianapolis",
    majorCities: ["Indianapolis", "Carmel", "Anderson", "Fishers", "Noblesville"],
    centerPoint: { lat: 39.7684, lon: -86.1581 },
    geohashPrefixes: ["dp9t", "dp9v", "dp9x", "dp9w", "dp9q"],
    radiusMiles: 40,
    timezone: "America/Indiana/Indianapolis",
    msaCode: "26900",
    population: 2100000,
    isMultiState: false,
  },

  {
    key: "us_oh_cleveland",
    country: "us",
    state: "oh",
    displayName: "Cleveland, OH",
    officialMSAName: "Cleveland-Elyria, OH Metropolitan Statistical Area",
    primaryCity: "Cleveland",
    majorCities: ["Cleveland", "Elyria", "Lakewood", "Parma", "Lorain"],
    centerPoint: { lat: 41.4993, lon: -81.6944 },
    geohashPrefixes: ["dps4", "dps5", "dps6", "dps1", "dps3"],
    radiusMiles: 40,
    timezone: "America/New_York",
    msaCode: "17460",
    population: 2100000,
    isMultiState: false,
  },

  {
    key: "us_tn_nashville",
    country: "us",
    state: "tn",
    displayName: "Nashville, TN",
    officialMSAName: "Nashville-Davidson-Murfreesboro-Franklin, TN Metropolitan Statistical Area",
    primaryCity: "Nashville",
    majorCities: ["Nashville", "Murfreesboro", "Franklin", "Clarksville", "Brentwood"],
    centerPoint: { lat: 36.1627, lon: -86.7816 },
    geohashPrefixes: ["dn9z", "dnad", "dnae", "dn9x", "dn9r"],
    radiusMiles: 45,
    timezone: "America/Chicago",
    msaCode: "34980",
    population: 2000000,
    isMultiState: false,
  },

  {
    key: "us_va_virginiabeach",
    country: "us",
    state: "va",
    displayName: "Virginia Beach, VA",
    officialMSAName: "Virginia Beach-Norfolk-Newport News, VA-NC Metropolitan Statistical Area",
    primaryCity: "Virginia Beach",
    majorCities: ["Virginia Beach", "Norfolk", "Newport News", "Hampton", "Chesapeake"],
    centerPoint: { lat: 36.8529, lon: -75.9780 },
    geohashPrefixes: ["dqcx", "dqcy", "dqcz", "dqcv", "dqcw"],
    radiusMiles: 40,
    timezone: "America/New_York",
    msaCode: "47260",
    population: 1800000,
    isMultiState: false,
  },

  {
    key: "us_ri_providence",
    country: "us",
    state: "ri",
    states: ["ri", "ma"],
    displayName: "Providence, RI-MA",
    officialMSAName: "Providence-Warwick, RI-MA Metropolitan Statistical Area",
    primaryCity: "Providence",
    majorCities: ["Providence", "Warwick", "Cranston", "Pawtucket", "East Providence"],
    centerPoint: { lat: 41.8240, lon: -71.4128 },
    geohashPrefixes: ["drm8", "drm9", "drmb", "drmf", "drm2"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "39300",
    population: 1600000,
    isMultiState: true,
  },

  {
    key: "us_wi_milwaukee",
    country: "us",
    state: "wi",
    displayName: "Milwaukee, WI",
    officialMSAName: "Milwaukee-Waukesha, WI Metropolitan Statistical Area",
    primaryCity: "Milwaukee",
    majorCities: ["Milwaukee", "Waukesha", "West Allis", "Wauwatosa", "Greenfield"],
    centerPoint: { lat: 43.0389, lon: -87.9065 },
    geohashPrefixes: ["dp87", "dp8e", "dp8d", "dp85", "dp84"],
    radiusMiles: 35,
    timezone: "America/Chicago",
    msaCode: "33340",
    population: 1600000,
    isMultiState: false,
  },

  {
    key: "us_ok_oklahomacity",
    country: "us",
    state: "ok",
    displayName: "Oklahoma City, OK",
    officialMSAName: "Oklahoma City, OK Metropolitan Statistical Area",
    primaryCity: "Oklahoma City",
    majorCities: ["Oklahoma City", "Norman", "Edmond", "Moore", "Midwest City"],
    centerPoint: { lat: 35.4676, lon: -97.5164 },
    geohashPrefixes: ["9y5w", "9y5x", "9y5r", "9y5p", "9y5q"],
    radiusMiles: 40,
    timezone: "America/Chicago",
    msaCode: "36420",
    population: 1400000,
    isMultiState: false,
  },

  {
    key: "us_nc_triangle",
    country: "us",
    state: "nc",
    displayName: "Triangle, NC",
    officialMSAName: "Raleigh-Durham-Chapel Hill, NC Metropolitan Statistical Area",
    primaryCity: "Raleigh",
    majorCities: ["Raleigh", "Durham", "Chapel Hill", "Cary", "Apex"],
    centerPoint: { lat: 35.7796, lon: -78.6382 },
    geohashPrefixes: ["dq8w", "dq8x", "dq8r", "dq8q", "dq8z"],
    radiusMiles: 40,
    timezone: "America/New_York",
    msaCode: "39580",
    population: 2200000,
    isMultiState: false,
  },

  {
    key: "us_tn_memphis",
    country: "us",
    state: "tn",
    states: ["tn", "ar", "ms"],
    displayName: "Memphis, TN-AR-MS",
    officialMSAName: "Memphis, TN-MS-AR Metropolitan Statistical Area",
    primaryCity: "Memphis",
    majorCities: ["Memphis", "Germantown", "Collierville", "Bartlett", "Southaven"],
    centerPoint: { lat: 35.1495, lon: -90.0490 },
    geohashPrefixes: ["9yw6", "9yw7", "9yw4", "9yw5", "9ywd"],
    radiusMiles: 40,
    timezone: "America/Chicago",
    msaCode: "32820",
    population: 1300000,
    isMultiState: true,
  },

  {
    key: "us_va_richmond",
    country: "us",
    state: "va",
    displayName: "Richmond, VA",
    officialMSAName: "Richmond, VA Metropolitan Statistical Area",
    primaryCity: "Richmond",
    majorCities: ["Richmond", "Henrico", "Chesterfield", "Petersburg", "Colonial Heights"],
    centerPoint: { lat: 37.5407, lon: -77.4360 },
    geohashPrefixes: ["dqby", "dqbv", "dqbw", "dqbt", "dqbq"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "40060",
    population: 1300000,
    isMultiState: false,
  },

  {
    key: "us_la_neworleans",
    country: "us",
    state: "la",
    displayName: "New Orleans, LA",
    officialMSAName: "New Orleans-Metairie, LA Metropolitan Statistical Area",
    primaryCity: "New Orleans",
    majorCities: ["New Orleans", "Metairie", "Kenner", "Chalmette", "Marrero"],
    centerPoint: { lat: 29.9511, lon: -90.0715 },
    geohashPrefixes: ["9vvn", "9vvp", "9vvq", "9vvj", "9vvm"],
    radiusMiles: 35,
    timezone: "America/Chicago",
    msaCode: "35380",
    population: 1300000,
    isMultiState: false,
  },

  {
    key: "us_ky_louisville",
    country: "us",
    state: "ky",
    states: ["ky", "in"],
    displayName: "Louisville, KY-IN",
    officialMSAName: "Louisville/Jefferson County, KY-IN Metropolitan Statistical Area",
    primaryCity: "Louisville",
    majorCities: ["Louisville", "Jeffersonville", "New Albany", "Clarksville", "Elizabethtown"],
    centerPoint: { lat: 38.2527, lon: -85.7585 },
    geohashPrefixes: ["dnh4", "dnh6", "dnh7", "dnh1", "dnh3"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "31140",
    population: 1300000,
    isMultiState: true,
  },

  {
    key: "us_ut_saltlakecity",
    country: "us",
    state: "ut",
    displayName: "Salt Lake City, UT",
    officialMSAName: "Salt Lake City-Provo-Orem, UT Combined Statistical Area",
    primaryCity: "Salt Lake City",
    majorCities: ["Salt Lake City", "Provo", "Orem", "Sandy", "West Jordan"],
    centerPoint: { lat: 40.7608, lon: -111.8910 },
    geohashPrefixes: ["9rue", "9ruf", "9rud", "9ru9", "9ru6"],
    radiusMiles: 40,
    timezone: "America/Denver",
    msaCode: "41620",
    population: 1200000,
    isMultiState: false,
  },

  {
    key: "us_ct_hartford",
    country: "us",
    state: "ct",
    displayName: "Hartford, CT",
    officialMSAName: "Hartford-East Hartford-Middletown, CT Metropolitan Statistical Area",
    primaryCity: "Hartford",
    majorCities: ["Hartford", "East Hartford", "Middletown", "New Britain", "West Hartford"],
    centerPoint: { lat: 41.7658, lon: -72.6734 },
    geohashPrefixes: ["drm3", "drm6", "drm7", "drm4", "drm9"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "25540",
    population: 1200000,
    isMultiState: false,
  },

  {
    key: "us_ny_buffalo",
    country: "us",
    state: "ny",
    displayName: "Buffalo, NY",
    officialMSAName: "Buffalo-Cheektowaga, NY Metropolitan Statistical Area",
    primaryCity: "Buffalo",
    majorCities: ["Buffalo", "Cheektowaga", "Niagara Falls", "Tonawanda", "West Seneca"],
    centerPoint: { lat: 42.8864, lon: -78.8784 },
    geohashPrefixes: ["dr7j", "dr7m", "dr7n", "dr7h", "dr7k"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "15380",
    population: 1200000,
    isMultiState: false,
  },

  {
    key: "us_al_birmingham",
    country: "us",
    state: "al",
    displayName: "Birmingham, AL",
    officialMSAName: "Birmingham-Hoover, AL Metropolitan Statistical Area",
    primaryCity: "Birmingham",
    majorCities: ["Birmingham", "Hoover", "Vestavia Hills", "Alabaster", "Bessemer"],
    centerPoint: { lat: 33.5186, lon: -86.8104 },
    geohashPrefixes: ["dj64", "dj66", "dj67", "dj61", "dj63"],
    radiusMiles: 35,
    timezone: "America/Chicago",
    msaCode: "13820",
    population: 1100000,
    isMultiState: false,
  },

  {
    key: "us_ny_rochester",
    country: "us",
    state: "ny",
    displayName: "Rochester, NY",
    officialMSAName: "Rochester, NY Metropolitan Statistical Area",
    primaryCity: "Rochester",
    majorCities: ["Rochester", "Greece", "Irondequoit", "Brighton", "Henrietta"],
    centerPoint: { lat: 43.1566, lon: -77.6088 },
    geohashPrefixes: ["dr7u", "dr7v", "dr7g", "dr7t", "dr7s"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "40380",
    population: 1100000,
    isMultiState: false,
  },

  {
    key: "us_mi_grandrapids",
    country: "us",
    state: "mi",
    displayName: "Grand Rapids, MI",
    officialMSAName: "Grand Rapids-Kentwood-Muskegon, MI Combined Statistical Area",
    primaryCity: "Grand Rapids",
    majorCities: ["Grand Rapids", "Kentwood", "Muskegon", "Wyoming", "Walker"],
    centerPoint: { lat: 42.9634, lon: -85.6681 },
    geohashPrefixes: ["dph7", "dph5", "dph6", "dphe", "dphd"],
    radiusMiles: 35,
    timezone: "America/Detroit",
    msaCode: "24340",
    population: 1100000,
    isMultiState: false,
  },

  {
    key: "us_nc_triad",
    country: "us",
    state: "nc",
    displayName: "Triad, NC",
    officialMSAName: "Winston-Salem-Greensboro-High Point, NC Metropolitan Statistical Area",
    primaryCity: "Winston-Salem",
    majorCities: ["Winston-Salem", "Greensboro", "High Point", "Kernersville", "Clemmons"],
    centerPoint: { lat: 36.0999, lon: -80.2442 },
    geohashPrefixes: ["dnr4", "dnr5", "dnr6", "dnr7", "dnre"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "49180",
    population: 1700000,
    isMultiState: false,
  },

  {
    key: "us_ca_fresno",
    country: "us",
    state: "ca",
    displayName: "Fresno, CA",
    officialMSAName: "Fresno, CA Metropolitan Statistical Area",
    primaryCity: "Fresno",
    majorCities: ["Fresno", "Clovis", "Madera", "Sanger", "Selma"],
    centerPoint: { lat: 36.7378, lon: -119.7871 },
    geohashPrefixes: ["9qba", "9qbb", "9qb8", "9qb9", "9qb2"],
    radiusMiles: 35,
    timezone: "America/Los_Angeles",
    msaCode: "23420",
    population: 1000000,
    isMultiState: false,
  },

  {
    key: "us_ok_tulsa",
    country: "us",
    state: "ok",
    displayName: "Tulsa, OK",
    officialMSAName: "Tulsa, OK Metropolitan Statistical Area",
    primaryCity: "Tulsa",
    majorCities: ["Tulsa", "Broken Arrow", "Owasso", "Bixby", "Jenks"],
    centerPoint: { lat: 36.1540, lon: -95.9928 },
    geohashPrefixes: ["9y70", "9y71", "9y74", "9y75", "9y7h"],
    radiusMiles: 35,
    timezone: "America/Chicago",
    msaCode: "46140",
    population: 1000000,
    isMultiState: false,
  },

  {
    key: "us_nm_albuquerque",
    country: "us",
    state: "nm",
    displayName: "Albuquerque, NM",
    officialMSAName: "Albuquerque, NM Metropolitan Statistical Area",
    primaryCity: "Albuquerque",
    majorCities: ["Albuquerque", "Rio Rancho", "Las Cruces", "Farmington", "Roswell"],
    centerPoint: { lat: 35.0844, lon: -106.6504 },
    geohashPrefixes: ["9whf", "9whg", "9whd", "9whe", "9wh7"],
    radiusMiles: 40,
    timezone: "America/Denver",
    msaCode: "10740",
    population: 920000,
    isMultiState: false,
  },

  {
    key: "us_tn_knoxville",
    country: "us",
    state: "tn",
    displayName: "Knoxville, TN",
    officialMSAName: "Knoxville, TN Metropolitan Statistical Area",
    primaryCity: "Knoxville",
    majorCities: ["Knoxville", "Maryville", "Oak Ridge", "Morristown", "Sevierville"],
    centerPoint: { lat: 35.9606, lon: -83.9207 },
    geohashPrefixes: ["dnk8", "dnk9", "dnkb", "dnk2", "dnk3"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "28940",
    population: 900000,
    isMultiState: false,
  },

  {
    key: "us_tx_elpaso",
    country: "us",
    state: "tx",
    displayName: "El Paso, TX",
    officialMSAName: "El Paso, TX Metropolitan Statistical Area",
    primaryCity: "El Paso",
    majorCities: ["El Paso", "Socorro", "Horizon City", "Fort Bliss", "Sunland Park"],
    centerPoint: { lat: 31.7619, lon: -106.4850 },
    geohashPrefixes: ["9th4", "9th5", "9th6", "9th1", "9th3"],
    radiusMiles: 35,
    timezone: "America/Denver",
    msaCode: "21340",
    population: 860000,
    isMultiState: false,
  },

  {
    key: "us_ne_omaha",
    country: "us",
    state: "ne",
    states: ["ne", "ia"],
    displayName: "Omaha, NE-IA",
    officialMSAName: "Omaha-Council Bluffs, NE-IA Metropolitan Statistical Area",
    primaryCity: "Omaha",
    majorCities: ["Omaha", "Council Bluffs", "Bellevue", "Papillion", "La Vista"],
    centerPoint: { lat: 41.2565, lon: -95.9345 },
    geohashPrefixes: ["9z86", "9z87", "9z84", "9z85", "9z8d"],
    radiusMiles: 35,
    timezone: "America/Chicago",
    msaCode: "36540",
    population: 960000,
    isMultiState: true,
  },

  {
    key: "us_id_boise",
    country: "us",
    state: "id",
    displayName: "Boise, ID",
    officialMSAName: "Boise City, ID Metropolitan Statistical Area",
    primaryCity: "Boise",
    majorCities: ["Boise", "Meridian", "Nampa", "Caldwell", "Eagle"],
    centerPoint: { lat: 43.6150, lon: -116.2023 },
    geohashPrefixes: ["9ryt", "9ryv", "9ryw", "9ryq", "9ryx"],
    radiusMiles: 35,
    timezone: "America/Boise",
    msaCode: "14260",
    population: 760000,
    isMultiState: false,
  },

  {
    key: "us_co_coloradosprings",
    country: "us",
    state: "co",
    displayName: "Colorado Springs, CO",
    officialMSAName: "Colorado Springs, CO Metropolitan Statistical Area",
    primaryCity: "Colorado Springs",
    majorCities: ["Colorado Springs", "Pueblo", "Canon City", "Fountain", "Security-Widefield"],
    centerPoint: { lat: 38.8339, lon: -104.8214 },
    geohashPrefixes: ["9wuh", "9wuk", "9wu5", "9wu7", "9wue"],
    radiusMiles: 35,
    timezone: "America/Denver",
    msaCode: "17820",
    population: 760000,
    isMultiState: false,
  },

  // =================================================================
  // TIER 4: STATE COVERAGE (20 MSAs)
  // Ensure every state has at least one region
  // =================================================================

  {
    key: "us_ak_anchorage",
    country: "us",
    state: "ak",
    displayName: "Anchorage, AK",
    officialMSAName: "Anchorage, AK Metropolitan Statistical Area",
    primaryCity: "Anchorage",
    majorCities: ["Anchorage", "Eagle River", "Girdwood", "Palmer", "Wasilla"],
    centerPoint: { lat: 61.2181, lon: -149.9003 },
    geohashPrefixes: ["bec4", "bec5", "bec6", "bec7", "bech"],
    radiusMiles: 40,
    timezone: "America/Anchorage",
    msaCode: "11260",
    population: 400000,
    isMultiState: false,
  },

  {
    key: "us_hi_honolulu",
    country: "us",
    state: "hi",
    displayName: "Honolulu, HI",
    officialMSAName: "Urban Honolulu, HI Metropolitan Statistical Area",
    primaryCity: "Honolulu",
    majorCities: ["Honolulu", "Pearl City", "Hilo", "Kailua", "Waipahu"],
    centerPoint: { lat: 21.3099, lon: -157.8581 },
    geohashPrefixes: ["87z9", "87zc", "87zd", "87z6", "87z3"],
    radiusMiles: 30,
    timezone: "Pacific/Honolulu",
    msaCode: "46520",
    population: 1000000,
    isMultiState: false,
  },

  {
    key: "us_me_portland",
    country: "us",
    state: "me",
    displayName: "Portland, ME",
    officialMSAName: "Portland-South Portland, ME Metropolitan Statistical Area",
    primaryCity: "Portland",
    majorCities: ["Portland", "South Portland", "Biddeford", "Saco", "Westbrook"],
    centerPoint: { lat: 43.6591, lon: -70.2568 },
    geohashPrefixes: ["druj", "drum", "drun", "druh", "druk"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "38860",
    population: 540000,
    isMultiState: false,
  },

  {
    key: "us_vt_burlington",
    country: "us",
    state: "vt",
    displayName: "Burlington, VT",
    officialMSAName: "Burlington-South Burlington, VT Metropolitan Statistical Area",
    primaryCity: "Burlington",
    majorCities: ["Burlington", "South Burlington", "Colchester", "Essex", "Rutland"],
    centerPoint: { lat: 44.4759, lon: -73.2121 },
    geohashPrefixes: ["drue", "druf", "drud", "dru9", "dru6"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "15540",
    population: 220000,
    isMultiState: false,
  },

  {
    key: "us_nh_manchester",
    country: "us",
    state: "nh",
    displayName: "Manchester, NH",
    officialMSAName: "Manchester-Nashua, NH Metropolitan Statistical Area",
    primaryCity: "Manchester",
    majorCities: ["Manchester", "Nashua", "Concord", "Derry", "Rochester"],
    centerPoint: { lat: 42.9956, lon: -71.4548 },
    geohashPrefixes: ["drt5", "drt7", "drt4", "drt6", "drth"],
    radiusMiles: 30,
    timezone: "America/New_York",
    msaCode: "31700",
    population: 420000,
    isMultiState: false,
  },

  {
    key: "us_ia_desmoines",
    country: "us",
    state: "ia",
    displayName: "Des Moines, IA",
    officialMSAName: "Des Moines-West Des Moines, IA Metropolitan Statistical Area",
    primaryCity: "Des Moines",
    majorCities: ["Des Moines", "West Des Moines", "Ankeny", "Urbandale", "Cedar Rapids"],
    centerPoint: { lat: 41.5868, lon: -93.6250 },
    geohashPrefixes: ["9zpp", "9zpq", "9zpn", "9zpj", "9zpm"],
    radiusMiles: 35,
    timezone: "America/Chicago",
    msaCode: "19780",
    population: 710000,
    isMultiState: false,
  },

  {
    key: "us_ks_wichita",
    country: "us",
    state: "ks",
    displayName: "Wichita, KS",
    officialMSAName: "Wichita, KS Metropolitan Statistical Area",
    primaryCity: "Wichita",
    majorCities: ["Wichita", "Derby", "Andover", "Haysville", "Bel Aire"],
    centerPoint: { lat: 37.6872, lon: -97.3301 },
    geohashPrefixes: ["9yez", "9yex", "9yev", "9yew", "9yeu"],
    radiusMiles: 30,
    timezone: "America/Chicago",
    msaCode: "48620",
    population: 650000,
    isMultiState: false,
  },

  {
    key: "us_ar_littlerock",
    country: "us",
    state: "ar",
    displayName: "Little Rock, AR",
    officialMSAName: "Little Rock-North Little Rock-Conway, AR Metropolitan Statistical Area",
    primaryCity: "Little Rock",
    majorCities: ["Little Rock", "North Little Rock", "Conway", "Benton", "Bryant"],
    centerPoint: { lat: 34.7465, lon: -92.2896 },
    geohashPrefixes: ["9yw0", "9yw1", "9yw4", "9yvx", "9yvz"],
    radiusMiles: 35,
    timezone: "America/Chicago",
    msaCode: "30780",
    population: 750000,
    isMultiState: false,
  },

  {
    key: "us_ms_jackson",
    country: "us",
    state: "ms",
    displayName: "Jackson, MS",
    officialMSAName: "Jackson, MS Metropolitan Statistical Area",
    primaryCity: "Jackson",
    majorCities: ["Jackson", "Clinton", "Pearl", "Madison", "Ridgeland"],
    centerPoint: { lat: 32.2988, lon: -90.1848 },
    geohashPrefixes: ["9vvb", "9vvc", "9vvf", "9vv8", "9vv9"],
    radiusMiles: 30,
    timezone: "America/Chicago",
    msaCode: "27140",
    population: 580000,
    isMultiState: false,
  },

  {
    key: "us_wv_charleston",
    country: "us",
    state: "wv",
    displayName: "Charleston, WV",
    officialMSAName: "Charleston, WV Metropolitan Statistical Area",
    primaryCity: "Charleston",
    majorCities: ["Charleston", "Huntington", "Morgantown", "Parkersburg", "Wheeling"],
    centerPoint: { lat: 38.3498, lon: -81.6326 },
    geohashPrefixes: ["dnjp", "dnjq", "dnjr", "dnjn", "dnjj"],
    radiusMiles: 35,
    timezone: "America/New_York",
    msaCode: "16620",
    population: 210000,
    isMultiState: false,
  },

  {
    key: "us_nd_fargo",
    country: "us",
    state: "nd",
    displayName: "Fargo, ND",
    officialMSAName: "Fargo, ND-MN Metropolitan Statistical Area",
    primaryCity: "Fargo",
    majorCities: ["Fargo", "West Fargo", "Moorhead", "Grand Forks", "Bismarck"],
    centerPoint: { lat: 46.8772, lon: -96.7898 },
    geohashPrefixes: ["cb8e", "cb8f", "cb8d", "cb8c", "cb89"],
    radiusMiles: 30,
    timezone: "America/Chicago",
    msaCode: "22020",
    population: 250000,
    isMultiState: false,
  },

  {
    key: "us_sd_siouxfalls",
    country: "us",
    state: "sd",
    displayName: "Sioux Falls, SD",
    officialMSAName: "Sioux Falls, SD Metropolitan Statistical Area",
    primaryCity: "Sioux Falls",
    majorCities: ["Sioux Falls", "Rapid City", "Aberdeen", "Brookings", "Watertown"],
    centerPoint: { lat: 43.5460, lon: -96.7313 },
    geohashPrefixes: ["9zuy", "9zuv", "9zuw", "9zuu", "9zug"],
    radiusMiles: 30,
    timezone: "America/Chicago",
    msaCode: "43620",
    population: 280000,
    isMultiState: false,
  },

  {
    key: "us_mt_billings",
    country: "us",
    state: "mt",
    displayName: "Billings, MT",
    officialMSAName: "Billings, MT Metropolitan Statistical Area",
    primaryCity: "Billings",
    majorCities: ["Billings", "Missoula", "Great Falls", "Bozeman", "Butte"],
    centerPoint: { lat: 45.7833, lon: -108.5007 },
    geohashPrefixes: ["c8eg", "c8ef", "c8ed", "c8ec", "c8e9"],
    radiusMiles: 30,
    timezone: "America/Denver",
    msaCode: "13740",
    population: 180000,
    isMultiState: false,
  },

  {
    key: "us_wy_cheyenne",
    country: "us",
    state: "wy",
    displayName: "Cheyenne, WY",
    officialMSAName: "Cheyenne, WY Metropolitan Statistical Area",
    primaryCity: "Cheyenne",
    majorCities: ["Cheyenne", "Casper", "Laramie", "Gillette", "Rock Springs"],
    centerPoint: { lat: 41.1400, lon: -104.8202 },
    geohashPrefixes: ["9xj2", "9xj3", "9xj8", "9xj9", "9xjb"],
    radiusMiles: 30,
    timezone: "America/Denver",
    msaCode: "16940",
    population: 100000,
    isMultiState: false,
  },

  {
    key: "us_mt_bozeman",
    country: "us",
    state: "mt",
    displayName: "Bozeman, MT",
    officialMSAName: "Bozeman, MT Micropolitan Statistical Area",
    primaryCity: "Bozeman",
    majorCities: ["Bozeman", "Belgrade", "Four Corners", "Manhattan"],
    centerPoint: { lat: 45.6770, lon: -111.0429 },
    geohashPrefixes: ["c8hb", "c8hc", "c8h8", "c8h9", "c8h2"],
    radiusMiles: 25,
    timezone: "America/Denver",
    population: 120000,
    isMultiState: false,
  },

  {
    key: "us_mt_missoula",
    country: "us",
    state: "mt",
    displayName: "Missoula, MT",
    officialMSAName: "Missoula, MT Metropolitan Statistical Area",
    primaryCity: "Missoula",
    majorCities: ["Missoula", "Lolo", "Orchard Homes", "East Missoula"],
    centerPoint: { lat: 46.8721, lon: -113.9940 },
    geohashPrefixes: ["c8cq", "c8cr", "c8cp", "c8c8", "c8cx"],
    radiusMiles: 25,
    timezone: "America/Denver",
    msaCode: "33540",
    population: 120000,
    isMultiState: false,
  },

  {
    key: "us_wa_spokane",
    country: "us",
    state: "wa",
    displayName: "Spokane, WA",
    officialMSAName: "Spokane-Spokane Valley, WA Metropolitan Statistical Area",
    primaryCity: "Spokane",
    majorCities: ["Spokane", "Spokane Valley", "Cheney", "Liberty Lake"],
    centerPoint: { lat: 47.6588, lon: -117.4260 },
    geohashPrefixes: ["c2e6", "c2e7", "c2e4", "c2e5", "c2ed"],
    radiusMiles: 30,
    timezone: "America/Los_Angeles",
    msaCode: "44060",
    population: 590000,
    isMultiState: false,
  },

  {
    key: "us_nv_reno",
    country: "us",
    state: "nv",
    displayName: "Reno, NV",
    officialMSAName: "Reno, NV Metropolitan Statistical Area",
    primaryCity: "Reno",
    majorCities: ["Reno", "Sparks", "Carson City", "Fernley"],
    centerPoint: { lat: 39.5296, lon: -119.8138 },
    geohashPrefixes: ["9rbp", "9rbq", "9rbn", "9rbj", "9rbm"],
    radiusMiles: 30,
    timezone: "America/Los_Angeles",
    msaCode: "39900",
    population: 490000,
    isMultiState: false,
  },

  {
    key: "us_nm_santafe",
    country: "us",
    state: "nm",
    displayName: "Santa Fe, NM",
    officialMSAName: "Santa Fe, NM Metropolitan Statistical Area",
    primaryCity: "Santa Fe",
    majorCities: ["Santa Fe", "Espanola", "Los Alamos", "Taos"],
    centerPoint: { lat: 35.6870, lon: -105.9378 },
    geohashPrefixes: ["9whv", "9whx", "9wht", "9whw", "9whs"],
    radiusMiles: 30,
    timezone: "America/Denver",
    msaCode: "42140",
    population: 150000,
    isMultiState: false,
  },

  {
    key: "us_wi_madison",
    country: "us",
    state: "wi",
    displayName: "Madison, WI",
    officialMSAName: "Madison, WI Metropolitan Statistical Area",
    primaryCity: "Madison",
    majorCities: ["Madison", "Sun Prairie", "Fitchburg", "Middleton", "Janesville"],
    centerPoint: { lat: 43.0731, lon: -89.4012 },
    geohashPrefixes: ["dp8b", "dp8c", "dp88", "dp89", "dp82"],
    radiusMiles: 30,
    timezone: "America/Chicago",
    msaCode: "31540",
    population: 680000,
    isMultiState: false,
  },

  // =================================================================
  // STATE FALLBACKS (50 regions)
  // For users in areas not covered by the 100 MSAs above
  // These are only used when user is >100 miles from any MSA
  // =================================================================

  // Alabama
  { key: "us_al_misc", country: "us", state: "al", displayName: "Alabama (Other)", officialMSAName: "Alabama State Fallback", primaryCity: "Alabama", majorCities: [], centerPoint: { lat: 32.806671, lon: -86.791130 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Alaska
  { key: "us_ak_misc", country: "us", state: "ak", displayName: "Alaska (Other)", officialMSAName: "Alaska State Fallback", primaryCity: "Alaska", majorCities: [], centerPoint: { lat: 61.370716, lon: -152.404419 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Anchorage", isMultiState: false, isFallback: true },

  // Arizona
  { key: "us_az_misc", country: "us", state: "az", displayName: "Arizona (Other)", officialMSAName: "Arizona State Fallback", primaryCity: "Arizona", majorCities: [], centerPoint: { lat: 33.729759, lon: -111.431221 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Phoenix", isMultiState: false, isFallback: true },

  // Arkansas
  { key: "us_ar_misc", country: "us", state: "ar", displayName: "Arkansas (Other)", officialMSAName: "Arkansas State Fallback", primaryCity: "Arkansas", majorCities: [], centerPoint: { lat: 34.969704, lon: -92.373123 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // California
  { key: "us_ca_misc", country: "us", state: "ca", displayName: "California (Other)", officialMSAName: "California State Fallback", primaryCity: "California", majorCities: [], centerPoint: { lat: 36.116203, lon: -119.681564 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Los_Angeles", isMultiState: false, isFallback: true },

  // Colorado
  { key: "us_co_misc", country: "us", state: "co", displayName: "Colorado (Other)", officialMSAName: "Colorado State Fallback", primaryCity: "Colorado", majorCities: [], centerPoint: { lat: 39.059811, lon: -105.311104 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Denver", isMultiState: false, isFallback: true },

  // Connecticut
  { key: "us_ct_misc", country: "us", state: "ct", displayName: "Connecticut (Other)", officialMSAName: "Connecticut State Fallback", primaryCity: "Connecticut", majorCities: [], centerPoint: { lat: 41.597782, lon: -72.755371 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Delaware
  { key: "us_de_misc", country: "us", state: "de", displayName: "Delaware (Other)", officialMSAName: "Delaware State Fallback", primaryCity: "Delaware", majorCities: [], centerPoint: { lat: 39.318523, lon: -75.507141 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Florida
  { key: "us_fl_misc", country: "us", state: "fl", displayName: "Florida (Other)", officialMSAName: "Florida State Fallback", primaryCity: "Florida", majorCities: [], centerPoint: { lat: 27.766279, lon: -81.686783 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Georgia
  { key: "us_ga_misc", country: "us", state: "ga", displayName: "Georgia (Other)", officialMSAName: "Georgia State Fallback", primaryCity: "Georgia", majorCities: [], centerPoint: { lat: 33.040619, lon: -83.643074 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Hawaii
  { key: "us_hi_misc", country: "us", state: "hi", displayName: "Hawaii (Other)", officialMSAName: "Hawaii State Fallback", primaryCity: "Hawaii", majorCities: [], centerPoint: { lat: 21.094318, lon: -157.498337 }, geohashPrefixes: [], radiusMiles: 0, timezone: "Pacific/Honolulu", isMultiState: false, isFallback: true },

  // Idaho
  { key: "us_id_misc", country: "us", state: "id", displayName: "Idaho (Other)", officialMSAName: "Idaho State Fallback", primaryCity: "Idaho", majorCities: [], centerPoint: { lat: 44.240459, lon: -114.478828 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Boise", isMultiState: false, isFallback: true },

  // Illinois
  { key: "us_il_misc", country: "us", state: "il", displayName: "Illinois (Other)", officialMSAName: "Illinois State Fallback", primaryCity: "Illinois", majorCities: [], centerPoint: { lat: 40.349457, lon: -88.986137 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Indiana
  { key: "us_in_misc", country: "us", state: "in", displayName: "Indiana (Other)", officialMSAName: "Indiana State Fallback", primaryCity: "Indiana", majorCities: [], centerPoint: { lat: 39.849426, lon: -86.258278 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Indiana/Indianapolis", isMultiState: false, isFallback: true },

  // Iowa
  { key: "us_ia_misc", country: "us", state: "ia", displayName: "Iowa (Other)", officialMSAName: "Iowa State Fallback", primaryCity: "Iowa", majorCities: [], centerPoint: { lat: 42.011539, lon: -93.210526 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Kansas
  { key: "us_ks_misc", country: "us", state: "ks", displayName: "Kansas (Other)", officialMSAName: "Kansas State Fallback", primaryCity: "Kansas", majorCities: [], centerPoint: { lat: 38.526600, lon: -96.726486 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Kentucky
  { key: "us_ky_misc", country: "us", state: "ky", displayName: "Kentucky (Other)", officialMSAName: "Kentucky State Fallback", primaryCity: "Kentucky", majorCities: [], centerPoint: { lat: 37.668140, lon: -84.670067 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Louisiana
  { key: "us_la_misc", country: "us", state: "la", displayName: "Louisiana (Other)", officialMSAName: "Louisiana State Fallback", primaryCity: "Louisiana", majorCities: [], centerPoint: { lat: 31.169546, lon: -91.867805 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Maine
  { key: "us_me_misc", country: "us", state: "me", displayName: "Maine (Other)", officialMSAName: "Maine State Fallback", primaryCity: "Maine", majorCities: [], centerPoint: { lat: 44.693947, lon: -69.381927 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Maryland
  { key: "us_md_misc", country: "us", state: "md", displayName: "Maryland (Other)", officialMSAName: "Maryland State Fallback", primaryCity: "Maryland", majorCities: [], centerPoint: { lat: 39.063946, lon: -76.802101 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Massachusetts
  { key: "us_ma_misc", country: "us", state: "ma", displayName: "Massachusetts (Other)", officialMSAName: "Massachusetts State Fallback", primaryCity: "Massachusetts", majorCities: [], centerPoint: { lat: 42.230171, lon: -71.530106 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Michigan
  { key: "us_mi_misc", country: "us", state: "mi", displayName: "Michigan (Other)", officialMSAName: "Michigan State Fallback", primaryCity: "Michigan", majorCities: [], centerPoint: { lat: 43.326618, lon: -84.536095 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Detroit", isMultiState: false, isFallback: true },

  // Minnesota
  { key: "us_mn_misc", country: "us", state: "mn", displayName: "Minnesota (Other)", officialMSAName: "Minnesota State Fallback", primaryCity: "Minnesota", majorCities: [], centerPoint: { lat: 45.694454, lon: -93.900192 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Mississippi
  { key: "us_ms_misc", country: "us", state: "ms", displayName: "Mississippi (Other)", officialMSAName: "Mississippi State Fallback", primaryCity: "Mississippi", majorCities: [], centerPoint: { lat: 32.741646, lon: -89.678696 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Missouri
  { key: "us_mo_misc", country: "us", state: "mo", displayName: "Missouri (Other)", officialMSAName: "Missouri State Fallback", primaryCity: "Missouri", majorCities: [], centerPoint: { lat: 38.456085, lon: -92.288368 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Montana
  { key: "us_mt_misc", country: "us", state: "mt", displayName: "Montana (Other)", officialMSAName: "Montana State Fallback", primaryCity: "Montana", majorCities: [], centerPoint: { lat: 46.921925, lon: -110.454353 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Denver", isMultiState: false, isFallback: true },

  // Nebraska
  { key: "us_ne_misc", country: "us", state: "ne", displayName: "Nebraska (Other)", officialMSAName: "Nebraska State Fallback", primaryCity: "Nebraska", majorCities: [], centerPoint: { lat: 41.125370, lon: -98.268082 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Nevada
  { key: "us_nv_misc", country: "us", state: "nv", displayName: "Nevada (Other)", officialMSAName: "Nevada State Fallback", primaryCity: "Nevada", majorCities: [], centerPoint: { lat: 38.313515, lon: -117.055374 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Los_Angeles", isMultiState: false, isFallback: true },

  // New Hampshire
  { key: "us_nh_misc", country: "us", state: "nh", displayName: "New Hampshire (Other)", officialMSAName: "New Hampshire State Fallback", primaryCity: "New Hampshire", majorCities: [], centerPoint: { lat: 43.452492, lon: -71.563896 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // New Jersey
  { key: "us_nj_misc", country: "us", state: "nj", displayName: "New Jersey (Other)", officialMSAName: "New Jersey State Fallback", primaryCity: "New Jersey", majorCities: [], centerPoint: { lat: 40.298904, lon: -74.521011 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // New Mexico
  { key: "us_nm_misc", country: "us", state: "nm", displayName: "New Mexico (Other)", officialMSAName: "New Mexico State Fallback", primaryCity: "New Mexico", majorCities: [], centerPoint: { lat: 34.840515, lon: -106.248482 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Denver", isMultiState: false, isFallback: true },

  // New York
  { key: "us_ny_misc", country: "us", state: "ny", displayName: "New York (Other)", officialMSAName: "New York State Fallback", primaryCity: "New York", majorCities: [], centerPoint: { lat: 42.165726, lon: -74.948051 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // North Carolina
  { key: "us_nc_misc", country: "us", state: "nc", displayName: "North Carolina (Other)", officialMSAName: "North Carolina State Fallback", primaryCity: "North Carolina", majorCities: [], centerPoint: { lat: 35.630066, lon: -79.806419 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // North Dakota
  { key: "us_nd_misc", country: "us", state: "nd", displayName: "North Dakota (Other)", officialMSAName: "North Dakota State Fallback", primaryCity: "North Dakota", majorCities: [], centerPoint: { lat: 47.528912, lon: -99.784012 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Ohio
  { key: "us_oh_misc", country: "us", state: "oh", displayName: "Ohio (Other)", officialMSAName: "Ohio State Fallback", primaryCity: "Ohio", majorCities: [], centerPoint: { lat: 40.388783, lon: -82.764915 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Oklahoma
  { key: "us_ok_misc", country: "us", state: "ok", displayName: "Oklahoma (Other)", officialMSAName: "Oklahoma State Fallback", primaryCity: "Oklahoma", majorCities: [], centerPoint: { lat: 35.565342, lon: -96.928917 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Oregon
  { key: "us_or_misc", country: "us", state: "or", displayName: "Oregon (Other)", officialMSAName: "Oregon State Fallback", primaryCity: "Oregon", majorCities: [], centerPoint: { lat: 44.572021, lon: -122.070938 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Los_Angeles", isMultiState: false, isFallback: true },

  // Pennsylvania
  { key: "us_pa_misc", country: "us", state: "pa", displayName: "Pennsylvania (Other)", officialMSAName: "Pennsylvania State Fallback", primaryCity: "Pennsylvania", majorCities: [], centerPoint: { lat: 40.590752, lon: -77.209755 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Rhode Island
  { key: "us_ri_misc", country: "us", state: "ri", displayName: "Rhode Island (Other)", officialMSAName: "Rhode Island State Fallback", primaryCity: "Rhode Island", majorCities: [], centerPoint: { lat: 41.680893, lon: -71.511780 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // South Carolina
  { key: "us_sc_misc", country: "us", state: "sc", displayName: "South Carolina (Other)", officialMSAName: "South Carolina State Fallback", primaryCity: "South Carolina", majorCities: [], centerPoint: { lat: 33.856892, lon: -80.945007 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // South Dakota
  { key: "us_sd_misc", country: "us", state: "sd", displayName: "South Dakota (Other)", officialMSAName: "South Dakota State Fallback", primaryCity: "South Dakota", majorCities: [], centerPoint: { lat: 44.299782, lon: -99.438828 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Tennessee
  { key: "us_tn_misc", country: "us", state: "tn", displayName: "Tennessee (Other)", officialMSAName: "Tennessee State Fallback", primaryCity: "Tennessee", majorCities: [], centerPoint: { lat: 35.747845, lon: -86.692345 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Texas
  { key: "us_tx_misc", country: "us", state: "tx", displayName: "Texas (Other)", officialMSAName: "Texas State Fallback", primaryCity: "Texas", majorCities: [], centerPoint: { lat: 31.054487, lon: -97.563461 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Utah
  { key: "us_ut_misc", country: "us",  state: "ut", displayName: "Utah (Other)", officialMSAName: "Utah State Fallback", primaryCity: "Utah", majorCities: [], centerPoint: { lat: 40.150032, lon: -111.862434 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Denver", isMultiState: false, isFallback: true },

  // Vermont
  { key: "us_vt_misc", country: "us", state: "vt", displayName: "Vermont (Other)", officialMSAName: "Vermont State Fallback", primaryCity: "Vermont", majorCities: [], centerPoint: { lat: 44.045876, lon: -72.710686 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Virginia
  { key: "us_va_misc", country: "us", state: "va", displayName: "Virginia (Other)", officialMSAName: "Virginia State Fallback", primaryCity: "Virginia", majorCities: [], centerPoint: { lat: 37.769337, lon: -78.169968 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Washington
  { key: "us_wa_misc", country: "us", state: "wa", displayName: "Washington (Other)", officialMSAName: "Washington State Fallback", primaryCity: "Washington", majorCities: [], centerPoint: { lat: 47.400902, lon: -121.490494 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Los_Angeles", isMultiState: false, isFallback: true },

  // West Virginia
  { key: "us_wv_misc", country: "us", state: "wv", displayName: "West Virginia (Other)", officialMSAName: "West Virginia State Fallback", primaryCity: "West Virginia", majorCities: [], centerPoint: { lat: 38.491226, lon: -80.954453 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/New_York", isMultiState: false, isFallback: true },

  // Wisconsin
  { key: "us_wi_misc", country: "us", state: "wi", displayName: "Wisconsin (Other)", officialMSAName: "Wisconsin State Fallback", primaryCity: "Wisconsin", majorCities: [], centerPoint: { lat: 44.268543, lon: -89.616508 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Chicago", isMultiState: false, isFallback: true },

  // Wyoming
  { key: "us_wy_misc", country: "us", state: "wy", displayName: "Wyoming (Other)", officialMSAName: "Wyoming State Fallback", primaryCity: "Wyoming", majorCities: [], centerPoint: { lat: 42.755966, lon: -107.302490 }, geohashPrefixes: [], radiusMiles: 0, timezone: "America/Denver", isMultiState: false, isFallback: true },
];

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Find region by key
 */
export function findRegionByKey(key: string): Region | undefined {
  return REGIONS.find(r => r.key === key);
}

/**
 * Get all regions for a specific state
 */
export function getRegionsByState(stateCode: string): Region[] {
  const state = stateCode.toLowerCase();
  return REGIONS.filter(r => 
    r.state === state || r.states?.includes(state)
  );
}

/**
 * Get region tier
 */
export function getRegionTier(region: Region): 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'fallback' {
  if (region.isFallback) return 'fallback';
  
  const index = REGIONS.indexOf(region);
  if (index < 30) return 'tier1';       // First 30
  if (index < 50) return 'tier2';       // Next 20
  if (index < 80) return 'tier3';       // Next 30
  if (index < 100) return 'tier4';      // Next 20
  return 'fallback';                     // Last 50
}

/**
 * Search regions by name
 */
export function searchRegions(query: string): Region[] {
  const q = query.toLowerCase();
  return REGIONS.filter(r => 
    r.displayName.toLowerCase().includes(q) ||
    r.primaryCity.toLowerCase().includes(q) ||
    r.majorCities.some(city => city.toLowerCase().includes(q))
  );
}

/**
 * Get total region count
 */
export const TOTAL_REGIONS = REGIONS.length; // 150

/**
 * Export tier counts
 */
export const TIER_COUNTS = {
  tier1: 30,    // Major golf markets
  tier2: 20,    // Golf destinations
  tier3: 30,    // Regional hubs
  tier4: 20,    // State coverage
  fallback: 50  // State fallbacks
};