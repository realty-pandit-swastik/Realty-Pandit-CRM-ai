/**
 * Indian States, Union Territories, and Districts
 * Used for structured address collection in inventory workflow.
 */

export interface IndianState {
    code: string;
    name: string;
}

export const INDIAN_STATES: IndianState[] = [
    // States (28)
    { code: 'AP', name: 'Andhra Pradesh' },
    { code: 'AR', name: 'Arunachal Pradesh' },
    { code: 'AS', name: 'Assam' },
    { code: 'BR', name: 'Bihar' },
    { code: 'CG', name: 'Chhattisgarh' },
    { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' },
    { code: 'HR', name: 'Haryana' },
    { code: 'HP', name: 'Himachal Pradesh' },
    { code: 'JH', name: 'Jharkhand' },
    { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' },
    { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'MH', name: 'Maharashtra' },
    { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' },
    { code: 'MZ', name: 'Mizoram' },
    { code: 'NL', name: 'Nagaland' },
    { code: 'OD', name: 'Odisha' },
    { code: 'PB', name: 'Punjab' },
    { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' },
    { code: 'TN', name: 'Tamil Nadu' },
    { code: 'TS', name: 'Telangana' },
    { code: 'TR', name: 'Tripura' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'UK', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' },
    // Union Territories (8)
    { code: 'AN', name: 'Andaman & Nicobar Islands' },
    { code: 'CH', name: 'Chandigarh' },
    { code: 'DN', name: 'Dadra & Nagar Haveli and Daman & Diu' },
    { code: 'DL', name: 'Delhi' },
    { code: 'JK', name: 'Jammu & Kashmir' },
    { code: 'LA', name: 'Ladakh' },
    { code: 'LD', name: 'Lakshadweep' },
    { code: 'PY', name: 'Puducherry' },
];

/**
 * Active states for WhatsApp workflow (NCR focus).
 * Only 7 states — fits within WhatsApp's 10-row interactive list limit.
 */
export const ACTIVE_STATES: IndianState[] = [
    { code: 'DL', name: 'Delhi' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'HR', name: 'Haryana' },
    { code: 'PB', name: 'Punjab' },
    { code: 'UK', name: 'Uttarakhand' },
    { code: 'CH', name: 'Chandigarh' },
    { code: 'RJ', name: 'Rajasthan' },
];

/**
 * Major districts/cities per state.
 * Focused on real-estate-active cities. Can be expanded over time.
 */
export const DISTRICTS_BY_STATE: Record<string, string[]> = {
    'AP': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Nellore', 'Kakinada', 'Rajahmundry', 'Kurnool', 'Anantapur'],
    'AR': ['Itanagar', 'Naharlagun', 'Pasighat'],
    'AS': ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Nagaon', 'Tezpur'],
    'BR': ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Darbhanga', 'Purnia'],
    'CG': ['Raipur', 'Bhilai', 'Bilaspur', 'Durg', 'Korba'],
    'GA': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'],
    'GJ': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Anand', 'Navsari'],
    'HR': ['Gurgaon', 'Faridabad', 'Panchkula', 'Karnal', 'Panipat', 'Ambala', 'Hisar', 'Rohtak', 'Sonipat', 'Rewari', 'Manesar', 'Sohna', 'Bahadurgarh', 'Dharuhera'],
    'HP': ['Shimla', 'Dharamshala', 'Manali', 'Solan', 'Kullu', 'Mandi'],
    'JH': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar'],
    'KA': ['Bengaluru', 'Mysuru', 'Hubli-Dharwad', 'Mangaluru', 'Belagavi', 'Davangere', 'Tumkur', 'Shimoga', 'Udupi'],
    'KL': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Alappuzha', 'Kannur'],
    'MP': ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain', 'Sagar', 'Dewas', 'Satna'],
    'MH': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Navi Mumbai', 'Solapur', 'Kolhapur', 'Panvel', 'Kalyan-Dombivli', 'Vasai-Virar', 'Mira-Bhayandar', 'Pimpri-Chinchwad', 'Lonavala', 'Kharghar'],
    'MN': ['Imphal'],
    'ML': ['Shillong'],
    'MZ': ['Aizawl'],
    'NL': ['Kohima', 'Dimapur'],
    'OD': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri'],
    'PB': ['Chandigarh', 'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Zirakpur', 'Dera Bassi'],
    'RJ': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Bhilwara', 'Alwar', 'Sikar'],
    'SK': ['Gangtok'],
    'TN': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi'],
    'TS': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Secunderabad', 'Medchal', 'Shamshabad'],
    'TR': ['Agartala'],
    'UP': ['Noida', 'Greater Noida', 'Ghaziabad', 'Lucknow', 'Agra', 'Varanasi', 'Kanpur', 'Prayagraj', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad', 'Gorakhpur', 'Mathura', 'Firozabad', 'Saharanpur', 'Muzaffarnagar', 'Jhansi', 'Gautam Buddh Nagar', 'Yamuna Expressway'],
    'UK': ['Dehradun', 'Haridwar', 'Rishikesh', 'Nainital', 'Haldwani', 'Roorkee', 'Mussoorie'],
    'WB': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Salt Lake', 'Rajarhat', 'New Town'],
    // Union Territories
    'AN': ['Port Blair'],
    'CH': ['Chandigarh'],
    'DN': ['Silvassa', 'Daman', 'Diu'],
    'DL': ['New Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Central Delhi', 'North East Delhi', 'North West Delhi', 'South East Delhi', 'South West Delhi', 'Shahdara', 'Dwarka', 'Rohini', 'Pitampura', 'Janakpuri', 'Vasant Kunj', 'Saket', 'Lajpat Nagar', 'Greater Kailash', 'Hauz Khas', 'Malviya Nagar', 'Mehrauli'],
    'JK': ['Srinagar', 'Jammu'],
    'LA': ['Leh', 'Kargil'],
    'LD': ['Kavaratti'],
    'PY': ['Puducherry', 'Karaikal'],
};

/** Alias: cities = districts (user-facing label is "City") */
export const CITIES_BY_STATE = DISTRICTS_BY_STATE;
