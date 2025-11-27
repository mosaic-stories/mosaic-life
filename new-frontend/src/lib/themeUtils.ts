// Theme color definitions in RGB format for CSS variables
export const themeColors = {
  'warm-amber': {
    primary: '217 119 6',        // amber-600
    primaryLight: '254 243 199',  // amber-100
    primaryDark: '180 83 9',      // amber-700
    accent: '253 230 138',        // amber-300
    accentLight: '254 252 232',   // amber-50
    gradientFrom: '251 191 36',   // amber-400 - more vibrant
    gradientTo: '249 115 22',     // orange-500 - bolder orange
    background: '255 251 235',    // amber-50
    surface: '254 252 232',       // lighter amber
  },
  'serene-blue': {
    primary: '37 99 235',         // blue-600
    primaryLight: '219 234 254',  // blue-100
    primaryDark: '29 78 216',     // blue-700
    accent: '147 197 253',        // blue-300
    accentLight: '239 246 255',   // blue-50
    gradientFrom: '96 165 250',   // blue-400 - more vibrant
    gradientTo: '56 189 248',     // sky-400 - bright sky
    background: '239 246 255',    // blue-50
    surface: '245 250 255',       // lighter blue
  },
  'gentle-rose': {
    primary: '225 29 72',         // rose-600
    primaryLight: '254 205 211',  // rose-200
    primaryDark: '190 18 60',     // rose-700
    accent: '251 113 133',        // rose-400
    accentLight: '255 241 242',   // rose-50
    gradientFrom: '251 113 133',  // rose-400 - more vibrant
    gradientTo: '244 114 182',    // pink-400 - bright pink
    background: '255 241 242',    // rose-50
    surface: '255 250 250',       // lighter rose
  },
  'forest-green': {
    primary: '5 150 105',         // emerald-600
    primaryLight: '209 250 229',  // emerald-100
    primaryDark: '4 120 87',      // emerald-700
    accent: '110 231 183',        // emerald-300
    accentLight: '236 253 245',   // emerald-50
    gradientFrom: '52 211 153',   // emerald-400 - more vibrant
    gradientTo: '45 212 191',     // teal-400 - bright teal
    background: '236 253 245',    // emerald-50
    surface: '240 253 250',       // lighter emerald
  },
  'twilight-purple': {
    primary: '147 51 234',        // purple-600
    primaryLight: '233 213 255',  // purple-200
    primaryDark: '126 34 206',    // purple-700
    accent: '192 132 252',        // purple-400
    accentLight: '250 245 255',   // purple-50
    gradientFrom: '168 85 247',   // purple-500 - more vibrant
    gradientTo: '129 140 248',    // indigo-400 - bright indigo
    background: '250 245 255',    // purple-50
    surface: '253 250 255',       // lighter purple
  },
  // Muted gradient themes
  'muted-sage': {
    primary: '120 113 108',       // stone-500
    primaryLight: '231 229 228',  // stone-200
    primaryDark: '87 83 78',      // stone-600
    accent: '168 162 158',        // stone-400
    accentLight: '250 250 249',   // stone-50
    gradientFrom: '214 211 209',  // stone-300 - softer gradient
    gradientTo: '203 213 225',    // slate-300 - cool gray
    background: '250 250 249',    // stone-50
    surface: '252 252 252',       // very light gray
  },
  'muted-lavender': {
    primary: '139 92 246',        // violet-500 (slightly muted)
    primaryLight: '237 233 254',  // violet-100
    primaryDark: '109 40 217',    // violet-600
    accent: '196 181 253',        // violet-300
    accentLight: '250 245 255',   // violet-50
    gradientFrom: '221 214 254',  // violet-200
    gradientTo: '224 231 255',    // indigo-100
    background: '248 250 252',    // slate-50
    surface: '252 252 253',       // very light slate
  },
  'muted-seafoam': {
    primary: '20 184 166',        // teal-500
    primaryLight: '204 251 241',  // teal-100
    primaryDark: '15 118 110',    // teal-600
    accent: '153 246 228',        // teal-300
    accentLight: '240 253 250',   // teal-50
    gradientFrom: '153 246 228',  // teal-300
    gradientTo: '186 230 253',    // sky-200
    background: '248 250 252',    // slate-50
    surface: '252 252 253',       // very light slate
  },
  'muted-clay': {
    primary: '234 88 12',         // orange-600 (earthier)
    primaryLight: '254 215 170',  // orange-200
    primaryDark: '194 65 12',     // orange-700
    accent: '251 146 60',         // orange-400
    accentLight: '255 247 237',   // orange-50
    gradientFrom: '252 211 77',   // amber-400
    gradientTo: '250 204 21',     // yellow-400
    background: '250 250 249',    // stone-50
    surface: '255 250 245',       // warm white
  },
  // Vibrant themes with bold gradients
  'vibrant-coral': {
    primary: '244 63 94',         // rose-500
    primaryLight: '255 228 230',  // rose-100
    primaryDark: '225 29 72',     // rose-600
    accent: '251 113 133',        // rose-400
    accentLight: '255 241 242',   // rose-50
    gradientFrom: '251 113 133',  // rose-400
    gradientTo: '236 72 153',     // fuchsia-500 - vibrant pink
    background: '255 241 242',    // rose-50
    surface: '255 250 250',       // lighter rose
  },
  'vibrant-ocean': {
    primary: '14 165 233',        // sky-500
    primaryLight: '186 230 253',  // sky-200
    primaryDark: '2 132 199',     // sky-600
    accent: '56 189 248',         // sky-400
    accentLight: '240 249 255',   // sky-50
    gradientFrom: '34 211 238',   // cyan-500 - bright cyan
    gradientTo: '59 130 246',     // blue-500 - electric blue
    background: '240 249 255',    // sky-50
    surface: '248 252 255',       // lighter sky
  },
  'vibrant-sunset': {
    primary: '249 115 22',        // orange-500
    primaryLight: '254 215 170',  // orange-200
    primaryDark: '234 88 12',     // orange-600
    accent: '251 146 60',         // orange-400
    accentLight: '255 247 237',   // orange-50
    gradientFrom: '251 146 60',   // orange-400
    gradientTo: '251 113 133',    // rose-400 - sunset blend
    background: '255 247 237',    // orange-50
    surface: '255 251 245',       // lighter orange
  },
  'vibrant-lime': {
    primary: '132 204 22',        // lime-600
    primaryLight: '217 249 157',  // lime-200
    primaryDark: '101 163 13',    // lime-700
    accent: '163 230 53',         // lime-400
    accentLight: '247 254 231',   // lime-50
    gradientFrom: '163 230 53',   // lime-400
    gradientTo: '34 197 94',      // green-500 - vibrant green
    background: '247 254 231',    // lime-50
    surface: '252 255 245',       // lighter lime
  },
  'deep-navy': {
    primary: '30 58 138',         // blue-900 (navy)
    primaryLight: '191 219 254',  // blue-200
    primaryDark: '23 37 84',      // slate-900 (darker navy)
    accent: '96 165 250',         // blue-400
    accentLight: '239 246 255',   // blue-50
    gradientFrom: '30 58 138',    // blue-900 (consistent navy)
    gradientTo: '37 99 235',      // blue-600 (slightly lighter navy)
    background: '241 245 249',    // slate-100 (light gray-blue)
    surface: '248 250 252',       // slate-50
  },
  'navy-gradient': {
    primary: '30 58 138',         // blue-900 (navy)
    primaryLight: '191 219 254',  // blue-200
    primaryDark: '23 37 84',      // slate-900 (darker navy)
    accent: '59 130 246',         // blue-500
    accentLight: '239 246 255',   // blue-50
    gradientFrom: '30 58 138',    // blue-900 (deep navy)
    gradientTo: '59 130 246',     // blue-500 (bright blue) - dramatic gradient
    background: '239 246 255',    // blue-50
    surface: '245 250 255',       // lighter blue
  },
};

export function applyTheme(themeId: string) {
  const colors = themeColors[themeId as keyof typeof themeColors] || themeColors['warm-amber'];
  const root = document.documentElement;
  
  root.style.setProperty('--theme-primary', colors.primary);
  root.style.setProperty('--theme-primary-light', colors.primaryLight);
  root.style.setProperty('--theme-primary-dark', colors.primaryDark);
  root.style.setProperty('--theme-accent', colors.accent);
  root.style.setProperty('--theme-accent-light', colors.accentLight);
  root.style.setProperty('--theme-gradient-from', colors.gradientFrom);
  root.style.setProperty('--theme-gradient-to', colors.gradientTo);
  root.style.setProperty('--theme-background', colors.background);
  root.style.setProperty('--theme-surface', colors.surface);
}