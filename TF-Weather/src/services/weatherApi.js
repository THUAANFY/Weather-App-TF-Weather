const BASE_URL = 'https://api.openweathermap.org/data/2.5'
const ONE_CALL_URL = 'https://api.openweathermap.org/data/3.0/onecall'
const GEO_URL = 'https://api.openweathermap.org/geo/1.0'

const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY
export const hasWeatherApiKey = Boolean(apiKey)

function ensureApiKey() {
  if (!apiKey) {
    throw new Error('Thi?u API key OpenWeatherMap. Hãy c?u hình VITE_OPENWEATHER_API_KEY trong file .env.')
  }
}

async function safeFetchJson(url, fallbackMessage) {
  try {
    const response = await fetch(url)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || fallbackMessage)
    }

    return data
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        'L?i m?ng: không th? k?t n?i t?i d?ch v? th?i ti?t. Hãy ki?m tra internet, VPN/proxy ho?c extension ch?n request.',
        { cause: error },
      )
    }
    throw error
  }
}

async function fetchJson(path, params) {
  ensureApiKey()
  const url = new URL(`${BASE_URL}${path}`)
  Object.entries({ ...params, appid: apiKey, units: 'metric', lang: 'vi' }).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })
  return safeFetchJson(url, 'Yêu c?u OpenWeatherMap th?t b?i.')
}

async function fetchOneCall(lat, lon) {
  ensureApiKey()
  const url = new URL(ONE_CALL_URL)
  Object.entries({
    lat,
    lon,
    appid: apiKey,
    units: 'metric',
    lang: 'vi',
  }).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })
  return safeFetchJson(url, 'Yêu c?u One Call 3.0 th?t b?i.')
}

function mapOneCallCurrent(oneCall, cityName, countryCode) {
  const c = oneCall.current
  return {
    name: cityName,
    dt: c.dt,
    timezone: oneCall.timezone_offset || 0,
    visibility: c.visibility || 10000,
    main: {
      temp: c.temp,
      humidity: c.humidity,
      feels_like: c.feels_like,
      pressure: c.pressure,
    },
    wind: {
      speed: c.wind_speed || 0,
      deg: c.wind_deg || 0,
      gust: c.wind_gust,
    },
    clouds: { all: c.clouds || 0 },
    sys: {
      country: countryCode || '--',
      sunrise: c.sunrise,
      sunset: c.sunset,
    },
    weather: c.weather || [{ main: 'Clouds', description: 'Nhi?u mây' }],
  }
}

function mapOneCallForecast(oneCall) {
  const list = (oneCall.hourly || []).slice(0, 48).map((item) => ({
    dt: item.dt,
    dt_txt: new Date(item.dt * 1000).toISOString().replace('T', ' ').slice(0, 19),
    main: { temp: item.temp },
    weather: item.weather || [{ main: 'Clouds', description: 'Nhi?u mây' }],
  }))
  return { list }
}

function mapOneCallExtras(oneCall) {
  const rainNextHour = (oneCall.minutely || []).slice(0, 60).reduce((sum, m) => sum + (m.precipitation || 0), 0)
  return {
    alerts: oneCall.alerts || [],
    rainNextHourMm: Number(rainNextHour.toFixed(2)),
  }
}

async function fetchCityMeta(city) {
  const results = await searchLocationsByName(city, 1)
  if (!results.length) throw new Error('Không tìm th?y thành ph?.')
  return results[0]
}

export async function getCurrentWeatherByCity(city) {
  try {
    const meta = await fetchCityMeta(city)
    const oneCall = await fetchOneCall(meta.lat, meta.lon)
    return mapOneCallCurrent(oneCall, meta.name, meta.country_code)
  } catch {
    return fetchJson('/weather', { q: city })
  }
}

export async function getForecastByCity(city) {
  try {
    const meta = await fetchCityMeta(city)
    const oneCall = await fetchOneCall(meta.lat, meta.lon)
    return mapOneCallForecast(oneCall)
  } catch {
    return fetchJson('/forecast', { q: city })
  }
}

export async function getCurrentWeatherByCoords(lat, lon) {
  try {
    const [oneCall, reverse] = await Promise.all([fetchOneCall(lat, lon), reverseGeocode(lat, lon)])
    return mapOneCallCurrent(oneCall, reverse.name, reverse.country_code)
  } catch {
    return fetchJson('/weather', { lat, lon })
  }
}

export async function getForecastByCoords(lat, lon) {
  try {
    const oneCall = await fetchOneCall(lat, lon)
    return mapOneCallForecast(oneCall)
  } catch {
    return fetchJson('/forecast', { lat, lon })
  }
}

export async function getWeatherExtrasByCoords(lat, lon) {
  try {
    const oneCall = await fetchOneCall(lat, lon)
    return mapOneCallExtras(oneCall)
  } catch {
    return { alerts: [], rainNextHourMm: 0 }
  }
}

export async function getWeatherExtrasByCity(city) {
  try {
    const meta = await fetchCityMeta(city)
    const oneCall = await fetchOneCall(meta.lat, meta.lon)
    return mapOneCallExtras(oneCall)
  } catch {
    return { alerts: [], rainNextHourMm: 0 }
  }
}

async function reverseGeocode(lat, lon) {
  ensureApiKey()
  const url = new URL(`${GEO_URL}/reverse`)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('limit', '1')
  url.searchParams.set('appid', apiKey)
  const data = await safeFetchJson(url, 'Yêu c?u reverse geocoding OpenWeatherMap th?t b?i.')
  const item = data?.[0]
  return {
    name: item?.name || 'V? trí hi?n t?i',
    country_code: item?.country || '--',
  }
}

export async function searchLocationsByName(query, limit = 5) {
  ensureApiKey()
  const url = new URL(`${GEO_URL}/direct`)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('appid', apiKey)
  const data = await safeFetchJson(url, 'Yêu c?u geocoding OpenWeatherMap th?t b?i.')
  return (data || []).map((item) => ({
    name: item.name,
    state: item.state,
    country: item.country,
    country_code: item.country,
    lat: item.lat,
    lon: item.lon,
  }))
}
