// News ticker / announcements panel.
// Mirrors: src/cljs/nr/news.cljs
import React, { useEffect, useState } from "react";
import { GET } from "./ajax";
import {
  dayWordWithTimeFormatter,
  formatDateTime,
  renderIcons,
} from "./utils";

interface NewsItem {
  _id?: string;
  date: string;
  item: string;
}

export function News(): React.ReactElement {
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    GET("/data/news").then((r) => {
      if (r.status === 200 && Array.isArray(r.json)) {
        setNews(r.json as NewsItem[]);
      }
    });
  }, []);

  return (
    <div id="news" className="news-box panel blue-shade">
      <ul className="list">
        {news.map((d) => (
          <li className="news-item" key={d.date}>
            <span className="date">
              {formatDateTime(dayWordWithTimeFormatter, d.date)}
            </span>
            <span className="title">
              {renderIcons(d.item ?? "") as React.ReactNode}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default News;
