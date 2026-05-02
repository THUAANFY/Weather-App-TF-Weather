import { useEffect, useMemo, useState } from 'react'
import {
  getCurrentWeatherByCity,
  getCurrentWeatherByCoords,
  getForecastByCity,
  getForecastByCoords,
  getWeatherExtrasByCity,
  getWeatherExtrasByCoords,
  hasWeatherApiKey,
  searchLocationsByName,
} from '../services/weatherApi'
import '../styles/home-page.css'
import tpLogo from '../assets/tp-logo.png'

const DEFAULT_CITY = 'Ho Chi Minh City'
const LIVE_SEARCH_DEBOUNCE_MS = 400

function formatHourFromUnix(unix, timezone) {
  return new Date((unix + timezone) * 1000).toUTCString().slice(17, 22)
}

function formatWeekday(unix, timezone) {
  return new Date((unix + timezone) * 1000).toLocaleDateString('vi-VN', { weekday: 'short' })
}

function formatDateParts(unix, timezone) {
  const date = new Date((unix + timezone) * 1000)
  const weekdays = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
  return {
    time: date.toISOString().slice(11, 19),
    weekday: weekdays[date.getUTCDay()],
    day: String(date.getUTCDate()).padStart(2, '0'),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    year: String(date.getUTCFullYear()),
  }
}

function toCompass(deg) {
  const dirs = ['B', 'ĐB', 'Đ', 'ĐN', 'N', 'TN', 'T', 'TB']
  return dirs[Math.round(((deg || 0) % 360) / 45) % 8]
}

function countryFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🏳️'
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

function countryNameFromCode(countryCode) {
  if (!countryCode || countryCode.length !== 2) return ''
  try {
    const display = new Intl.DisplayNames(['vi'], { type: 'region' })
    return display.of(countryCode.toUpperCase()) || countryCode.toUpperCase()
  } catch {
    return countryCode.toUpperCase()
  }
}

function iconFor(main) {
  switch ((main || '').toLowerCase()) {
    case 'rain':
    case 'drizzle':
      return 'fa-cloud-rain'
    case 'thunderstorm':
      return 'fa-cloud-bolt'
    case 'snow':
      return 'fa-snowflake'
    case 'clouds':
      return 'fa-cloud'
    case 'mist':
    case 'fog':
    case 'haze':
      return 'fa-smog'
    case 'clear':
    default:
      return 'fa-sun'
  }
}

function pickDailyForecast(items) {
  const byDate = new Map()

  for (const item of items) {
    const key = item.dt_txt.slice(0, 10)
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key).push(item)
  }

  return Array.from(byDate.values())
    .map((group) => {
      const noon = group.find((x) => x.dt_txt.includes('12:00:00'))
      return noon || group[Math.floor(group.length / 2)]
    })
    .slice(0, 5)
}

function getThemeByWeather(main) {
  switch ((main || '').toLowerCase()) {
    case 'rain':
    case 'drizzle':
      return { overlay: 'rain-theme' }
    case 'thunderstorm':
      return { overlay: 'storm-theme' }
    case 'snow':
      return { overlay: 'snow-theme' }
    case 'clouds':
    case 'mist':
    case 'fog':
    case 'haze':
      return { overlay: 'cloud-theme' }
    default:
      return { overlay: 'clear-theme' }
  }
}

function HomePage() {
  const [query, setQuery] = useState(DEFAULT_CITY)
  const [weather, setWeather] = useState(null)
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))
  const [forecastList, setForecastList] = useState([])
  const [loading, setLoading] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [rainNextHourMm, setRainNextHourMm] = useState(0)
  const [error, setError] = useState(
    hasWeatherApiKey ? '' : 'Thiếu API key OpenWeatherMap. Hãy cấu hình VITE_OPENWEATHER_API_KEY trong file .env.',
  )
  const [searchResults, setSearchResults] = useState([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isUserTyping, setIsUserTyping] = useState(false)

  const theme = useMemo(() => getThemeByWeather(weather?.weather?.[0]?.main), [weather])
  const hourlyForecast = useMemo(() => forecastList.slice(0, 6), [forecastList])
  const dailyForecast = useMemo(() => pickDailyForecast(forecastList), [forecastList])

  async function loadByCity(city) {
    if (!hasWeatherApiKey) return
    setLoading(true)
    setError('')

    try {
      const [current, forecastData, extras] = await Promise.all([
        getCurrentWeatherByCity(city),
        getForecastByCity(city),
        getWeatherExtrasByCity(city),
      ])
      setWeather(current)
      setForecastList(forecastData.list || [])
      setAlerts(extras.alerts || [])
      setRainNextHourMm(extras.rainNextHourMm || 0)
    } catch (apiError) {
      setError(apiError.message || 'Không thể tải dữ liệu thời tiết.')
    } finally {
      setLoading(false)
    }
  }

  async function loadByCoords(lat, lon, nextQuery) {
    if (!hasWeatherApiKey) return
    setLoading(true)
    setError('')

    try {
      const [current, forecastData, extras] = await Promise.all([
        getCurrentWeatherByCoords(lat, lon),
        getForecastByCoords(lat, lon),
        getWeatherExtrasByCoords(lat, lon),
      ])
      setWeather(current)
      setForecastList(forecastData.list || [])
      setAlerts(extras.alerts || [])
      setRainNextHourMm(extras.rainNextHourMm || 0)
      if (nextQuery) setQuery(nextQuery)
      else setQuery(current.name)
    } catch (apiError) {
      setError(apiError.message || 'Không thể tải dữ liệu thời tiết.')
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(event) {
    event.preventDefault()
    if (!query.trim()) return
    setIsUserTyping(false)
    loadByCity(query.trim())
    setIsSearchOpen(false)
  }

  function handleLocate() {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ định vị.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => loadByCoords(position.coords.latitude, position.coords.longitude),
      () => setError('Không thể lấy vị trí hiện tại của bạn.'),
    )
  }

  function handleSelectLocation(item) {
    const countryName = countryNameFromCode(item.country_code) || item.country
    const fullName = [item.name, item.state, countryName].filter(Boolean).join(', ')
    setIsUserTyping(false)
    setQuery(fullName)
    setSearchResults([])
    setIsSearchOpen(false)
    loadByCoords(item.lat, item.lon, fullName)
  }

  useEffect(() => {
    if (!hasWeatherApiKey) return

    if (!isUserTyping || !isInputFocused) return

    const keyword = query.trim()
    if (keyword.length < 2) return

    const timer = setTimeout(async () => {
      try {
        const results = await searchLocationsByName(keyword, 6)
        setSearchResults(results)
        setIsSearchOpen(results.length > 0)
      } catch {
        setSearchResults([])
        setIsSearchOpen(false)
      }
    }, LIVE_SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, isUserTyping, isInputFocused])

  useEffect(() => {
    if (!hasWeatherApiKey) return
    if (!navigator.geolocation) {
      const timer = setTimeout(() => {
        loadByCity(DEFAULT_CITY)
      }, 0)
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsUserTyping(false)
          loadByCoords(position.coords.latitude, position.coords.longitude)
        },
        () => {
          loadByCity(DEFAULT_CITY)
        },
      )
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  function handleQueryChange(value) {
    setIsUserTyping(true)
    setQuery(value)
    if (value.trim().length < 2) {
      setSearchResults([])
      setIsSearchOpen(false)
      return
    }
  }

  return (
    <main className={`weather-app ${theme.overlay}`}>
      <div className="weather-shell py-3 py-md-4">
        <div className="search-wrap mb-3">
          <div className="brand-logo-wrap" aria-hidden="true">
            <img src={tpLogo} alt="" className="brand-logo" />
          </div>
          <form className="search-panel" onSubmit={handleSearch}>
            <div className="search-main">
              <i className="fa-solid fa-magnifying-glass search-main-icon" />
              <input
                className="search-input"
                type="text"
                value={query}
                placeholder="Tìm thành phố, ví dụ: Hà Nội"
                onChange={(event) => handleQueryChange(event.target.value)}
                onFocus={() => {
                  setIsInputFocused(true)
                  setIsSearchOpen(isUserTyping && searchResults.length > 0)
                }}
                onBlur={() => {
                  setIsInputFocused(false)
                  setTimeout(() => setIsSearchOpen(false), 120)
                }}
                disabled={!hasWeatherApiKey}
              />
              <button type="submit" className="search-chip chip-primary" disabled={loading || !hasWeatherApiKey}>
                <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-magnifying-glass'} me-2`} />
                Tìm thời tiết
              </button>
              <button
                type="button"
                className="search-chip chip-secondary"
                onClick={handleLocate}
                disabled={loading || !hasWeatherApiKey}
              >
                <i className="fa-solid fa-location-crosshairs me-2" />
                Vị trí của tôi
              </button>
            </div>

            {isSearchOpen && searchResults.length > 0 && (
              <div className="search-dropdown" role="listbox" aria-label="Gợi ý thành phố">
                {searchResults.map((item) => {
                  const countryName = countryNameFromCode(item.country_code) || item.country
                  const title = [item.name, item.state, countryName].filter(Boolean).join(', ')
                  return (
                    <button
                      key={`${item.name}-${item.lat}-${item.lon}`}
                      type="button"
                      className="search-option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelectLocation(item)}
                    >
                      <span className="search-flag">{countryFlag(item.country_code)}</span>
                      <span className="search-meta">
                        <strong>{title}</strong>
                        <small>{item.lat.toFixed(2)}, {item.lon.toFixed(2)}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </form>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {loading && <div className="loading-card">Đang tải dữ liệu thời tiết...</div>}

        {weather && !loading && (
          <section className="dashboard-grid">
            <article className="panel-main glass-card">
              <div className="panel-main-mobile-logo" aria-hidden="true">
                <img src={tpLogo} alt="" className="panel-main-mobile-logo-img" />
              </div>
              <p className="city-name"><i className="fa-solid fa-location-dot me-2" />{weather.name}, {weather.sys.country}</p>
              <p className="temp-main">{Math.round(weather.main.temp)}°</p>
              <p className="weather-main text-capitalize">{weather.weather[0].description}</p>
              <p className="updated-at">Cập nhật: {formatHourFromUnix(weather.dt, weather.timezone)}</p>

              <div className="left-details-grid">
                {(() => {
                  const dateParts = formatDateParts(nowUnix, weather.timezone)
                  return (
                    <div className="stat-item stat-item-wide">
                      <span>Thời gian địa phương</span>
                      <strong className="time-primary">{dateParts.time}</strong>
                      <small className="time-secondary">
                        {dateParts.weekday} | {dateParts.day}/{dateParts.month}/{dateParts.year}
                      </small>
                    </div>
                  )
                })()}
                <div className="stat-item"><span>Cảm giác</span><strong>{Math.round(weather.main.feels_like)}°</strong></div>
                <div className="stat-item"><span>Áp suất</span><strong>{weather.main.pressure} hPa</strong></div>
                <div className="stat-item"><span>Tầm nhìn</span><strong>{(weather.visibility / 1000).toFixed(1)} km</strong></div>
                <div className="stat-item"><span>Độ ẩm</span><strong>{weather.main.humidity}%</strong></div>
              </div>
            </article>

            <div className="panel-right">
              <article className="glass-card panel-strip">
                <h3 className="panel-title">Dự báo theo giờ</h3>
                <div className="strip-list">
                  {hourlyForecast.map((item, index) => (
                    <div key={item.dt} className={`strip-item ${index === 0 ? 'active' : ''}`}>
                      <small>{index === 0 ? 'Hiện tại' : formatHourFromUnix(item.dt, weather.timezone)}</small>
                      <strong>{Math.round(item.main.temp)}°</strong>
                      <i className={`fa-solid ${iconFor(item.weather[0].main)}`} />
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass-card panel-strip">
                <h3 className="panel-title">Dự báo hằng ngày</h3>
                <div className="strip-list">
                  {dailyForecast.map((item, index) => (
                    <div key={item.dt} className={`strip-item ${index === 0 ? 'active' : ''}`}>
                      <small>{index === 0 ? 'Hôm nay' : formatWeekday(item.dt, weather.timezone)}</small>
                      <strong>{Math.round(item.main.temp)}°</strong>
                      <i className={`fa-solid ${iconFor(item.weather[0].main)}`} />
                    </div>
                  ))}
                </div>
              </article>

              <div className="bottom-panels">
                <article className="glass-card stat-large">
                  <h3 className="panel-title">Gió</h3>
                  <div className="wind-head">
                    <p className="big-value">{Math.round(weather.wind.speed * 3.6)} km/h</p>
                    <div className="compass" aria-hidden="true">
                      <span className="compass-n">B</span>
                      <span className="compass-e">Đ</span>
                      <span className="compass-s">N</span>
                      <span className="compass-w">T</span>
                      <div className="compass-needle" style={{ transform: `translate(-50%, -90%) rotate(${weather.wind.deg || 0}deg)` }} />
                    </div>
                  </div>
                  <p className="muted">Hướng gió: {toCompass(weather.wind.deg)} ({weather.wind.deg || 0}°)</p>
                  <p className="muted">Gió giật: {weather.wind.gust ? `${Math.round(weather.wind.gust * 3.6)} km/h` : 'Không có dữ liệu'}</p>
                </article>
                <article className="glass-card stat-large">
                  <h3 className="panel-title">Khí quyển</h3>
                  <p className="big-value">{weather.clouds.all}%</p>
                  <p className="muted">Mức độ mây che phủ</p>
                  <p className="muted">Mưa 1 giờ tới: {rainNextHourMm} mm</p>
                  <p className="muted">Mặt trời mọc: {formatHourFromUnix(weather.sys.sunrise, weather.timezone)} | Mặt trời lặn: {formatHourFromUnix(weather.sys.sunset, weather.timezone)}</p>
                </article>
              </div>
            </div>
          </section>
        )}

        {alerts.length > 0 && !loading && (
          <section className="glass-card p-3 mt-3">
            <h3 className="panel-title mb-2">Cảnh báo thời tiết</h3>
            {alerts.slice(0, 3).map((alert) => (
              <p key={`${alert.event}-${alert.start}`} className="muted mb-1">
                <strong>{alert.event}:</strong> {alert.description?.slice(0, 160) || 'Không có mô tả'}
              </p>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}

export default HomePage
