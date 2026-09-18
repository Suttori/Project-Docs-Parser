
import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import './App.css'

function extractTables(document) {
  const tables = []

  const content = document.body?.content || []

  for (const element of content) {
    if (!element.table) {
      continue
    }

    const rows = element.table.tableRows || []

    const table = rows.map((row) => {
      const cells = row.tableCells || []

      return cells.map((cell) => {
        const cellContent = cell.content || []

        let text = ''

        for (const element of cellContent) {
          if (element.paragraph?.elements) {
            for (const paragraphElement of element.paragraph.elements) {
              text += paragraphElement.textRun?.content || ''
            }
          }
        }

        return text.trim()
      })
    })

    tables.push(table)
  }

  return tables
}


function parseSchedule(table) {
  if (!table || table.length < 2) {
    return []
  }

  const people = {}

  // Названия смен по колонкам таблицы
  const shifts = [
    '06:00–10:00',
    '10:00–14:00',
    '14:00–18:00',
    '18:00–22:00',
    '22:00–06:00',
  ]

  // Оплата дневных смен
  const weekdayRate = 1200
  const weekendRate = 1400

  // Оплата ночной смены
  const nightRate = 3500

  // Пн-Пт
  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт']

  // Нормализация имени.
  // Приводит разные виды апострофов и пробелов к одному виду.

function normalizeName(name) {
  return name
    .normalize('NFKC')
    .replace(/[\u0027\u0060\u00B4\u02BC\u055A\u2018\u2019\u201B\u2032\uFF07]/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('uk-UA')
}

function normalizeNameKey(name) {
  return name
    .normalize('NFKC')
    .replace(/[\u0027\u0060\u00B4\u02BC\u055A\u2018\u2019\u201B\u2032\uFF07]/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('uk-UA')
}

const personKey = normalizeNameKey(name)

if (!people[personKey]) {
  people[personKey] = {
    name, // сохраняем оригинальное написание
    days: {},
    weeklyEarnings: 0,
  }
}




  // Пропускаем первую строку — это заголовки таблицы
  for (let rowIndex = 1; rowIndex < table.length; rowIndex++) {
    const row = table[rowIndex]

    if (!row || !row[0]?.trim()) {
      continue
    }

    // Например:
    // "Пн\n14/09"
    const dayParts = row[0]
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean)

    const dayName = dayParts[0] || ''
    const date = dayParts[1] || ''

    if (!dayName || !date) {
      continue
    }

    const dayKey = `${dayName} ${date}`

    // Обрабатываем каждую смену
    for (
      let columnIndex = 1;
      columnIndex < row.length;
      columnIndex++
    ) {
      const cell = row[columnIndex] || ''

      if (!cell.trim()) {
        continue
      }

      // Последняя колонка — ночная смена
      const isNightShift = columnIndex === 5

      let rate

      if (isNightShift) {
        rate = nightRate
      } else {
        rate = weekdays.includes(dayName)
          ? weekdayRate
          : weekendRate
      }

      const shiftName = shifts[columnIndex - 1]

      // В одной ячейке может быть несколько сотрудников
      const lines = cell
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      for (const line of lines) {
        /*
          Примеры:

          Мар’яна (335) TG+online
          Мар'яна (335)
          Мар’яна
        */

        // Сначала удаляем всё после ID сотрудника.
        // Из:
        // "Мар’яна (335) TG+online"
        //
        // получаем:
        // "Мар’яна"
        const match = line.match(/^(.+?)\s*\(\d+\)/)

        let name

        if (match) {
          name = match[1]
        } else {
          name = line
        }

        // Нормализуем имя
        name = normalizeName(name)

        if (!name) {
          continue
        }

        /*
          Нормализованное имя используется как ключ.

          Например:

          Мар’яна
          Мар'яна
          Мар’яна
          Мар’яна

          после normalizeName() становятся:

          Мар'яна

          Поэтому они попадут в одного человека.
        */
        const personKey = name

        // Если человека ещё нет — создаём
        if (!people[personKey]) {
          people[personKey] = {
            name,
            days: {},
            weeklyEarnings: 0,
          }
        }

        // Если у человека ещё нет этого дня — создаём
        if (!people[personKey].days[dayKey]) {
          people[personKey].days[dayKey] = {
            day: dayName,
            date,
            shifts: [],
            earnings: 0,
          }
        }

        // Добавляем смену
        people[personKey].days[dayKey].shifts.push({
          shift: shiftName,
          earnings: rate,
        })

        // Добавляем деньги за день
        people[personKey].days[dayKey].earnings += rate

        // Добавляем деньги за неделю
        people[personKey].weeklyEarnings += rate
      }
    }
  }

  // Сортировка:
  // сначала Мар'яна, затем остальные по заработку
  return Object.values(people).sort((a, b) => {
    if (a.name === "Мар'яна") return -1
    if (b.name === "Мар'яна") return 1

    return b.weeklyEarnings - a.weeklyEarnings
  })
}




function formatMoney(amount) {
  return `${amount.toLocaleString('uk-UA')} грн`
}

function App() {
  const [url, setUrl] = useState('')
  const [accessToken, setAccessToken] = useState(null)
  const [document, setDocument] = useState(null)
  const [error, setError] = useState('')

  // Авторизация только для доступа к Google Docs.
  // Отдельного GoogleLogin больше нет.
  const loginForDocs = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/documents.readonly',

    onSuccess: (tokenResponse) => {
      console.log('Google Docs access granted')

      setAccessToken(tokenResponse.access_token)
      setError('')
    },

    onError: () => {
      console.log('Google Docs authorization failed')
      setError('Не удалось получить доступ к Google Docs')
    },
  })

  const handleLoad = async () => {
    setError('')
    setDocument(null)

    if (!url.trim()) {
      setError('Введите ссылку на Google документ')
      return
    }

    if (!accessToken) {
      setError('Сначала предоставьте доступ к Google Docs')
      return
    }

    const match = url.match(
      /\/document\/d\/([a-zA-Z0-9_-]+)/
    )

    if (!match) {
      setError('Некорректная ссылка на Google Docs')
      return
    }

    const documentId = match[1]

    console.log('Document ID:', documentId)

    try {
      const response = await fetch(
        `https://docs.googleapis.com/v1/documents/${documentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json()

        console.error(errorData)

        throw new Error(
          errorData.error?.message ||
          'Не удалось загрузить документ'
        )
      }

      const data = await response.json()

      console.log('Google Document:', data)

      const tables = extractTables(data)

      console.log('Extracted tables:', tables)

      const schedule = parseSchedule(tables[0])

      console.log('Parsed schedule:', schedule)

      setDocument({
        ...data,
        extractedTables: tables,
        schedule,
      })
    } catch (error) {
      console.error(error)

      setError(
        error.message || 'Произошла ошибка при загрузке документа'
      )
    }
  }

  return (
    <div className="app">
      <div className="container">

        <header className="header">
          <h1>Google Docs Parser</h1>

          <p>
            Загрузите Google документ и получите его содержимое
          </p>
        </header>

        <main className="card">

          <label htmlFor="document-url">
            Ссылка на Google документ
          </label>

          <div className="input-row">

            <input
              id="document-url"
              type="text"
              placeholder="https://docs.google.com/document/..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleLoad()
                }
              }}
            />

            <button onClick={handleLoad}>
              Загрузить
            </button>

          </div>

          <p className="hint">
            Вставьте ссылку на Google Docs.
          </p>

          <div className="login-section">

            <p>
              Разрешите приложению читать Google документы:
            </p>

            <button
              className="docs-access-button"
              onClick={() => loginForDocs()}
            >
              Разрешить доступ к Google Docs
            </button>

          </div>

          {accessToken && (
            <div className="login-success">
              Доступ к Google Docs получен
            </div>
          )}

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          {document && (
            <div className="document-result">

              <h2>{document.title}</h2>

              <p>
                Документ успешно загружен.
              </p>

              {document.schedule &&
                document.schedule.length > 0 && (

                <div className="schedule-result">

                  <h2>Заработок сотрудников</h2>

                  <div className="schedule-table-wrapper">

                    <table className="schedule-table">

                      <thead>
                        <tr>
                          <th>Имя</th>
                          <th>Дни и смены</th>
                          <th>За неделю</th>
                        </tr>
                      </thead>

                      <tbody>

                        {document.schedule.map((person) => (
                          <tr key={person.name}>

                            <td className="person-name">
                              {person.name}
                            </td>

                            <td>
                              <div className="person-days">

                                {Object.values(person.days).map(
                                  (day) => (
                                    <div
                                      className="person-day"
                                      key={`${day.day}-${day.date}`}
                                    >

                                      <div className="day-header">

                                        <strong>
                                          {day.day} {day.date}
                                        </strong>

                                        <span>
                                          {formatMoney(
                                            day.earnings
                                          )}
                                        </span>

                                      </div>

                                      <div className="day-shifts">

                                        {day.shifts.map(
                                          (shift, index) => (
                                            <div
                                              className="shift"
                                              key={`${shift.shift}-${index}`}
                                            >

                                              <span>
                                                {shift.shift}
                                              </span>

                                              <span>
                                                {formatMoney(
                                                  shift.earnings
                                                )}
                                              </span>

                                            </div>
                                          )
                                        )}

                                      </div>

                                    </div>
                                  )
                                )}

                              </div>
                            </td>

                            <td className="weekly-earnings">
                              {formatMoney(
                                person.weeklyEarnings
                              )}
                            </td>

                          </tr>
                        ))}

                      </tbody>

                    </table>

                  </div>

                </div>
              )}

            </div>
          )}

        </main>

      </div>
    </div>
  )
}

export default App