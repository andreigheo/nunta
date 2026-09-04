"use client";

import * as React from "react";
import { ArrowUpRight, Send } from "lucide-react";

type ContactFormCopy = {
  eyebrow: string;
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  topicLabel: string;
  topics: readonly string[];
  messageLabel: string;
  messagePlaceholder: string;
  submitLabel: string;
  note: string;
  prepared: string;
};

export function ContactForm({
  destination,
  copy,
}: {
  destination: string;
  copy: ContactFormCopy;
}) {
  const [prepared, setPrepared] = React.useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const topic = String(data.get("topic") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();
    const subject = `[Sarbato] ${topic}`;
    const body = [`Nume: ${name}`, `Email: ${email}`, "", message].join("\n");

    setPrepared(true);
    window.location.assign(
      `mailto:${destination}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    );
  }

  return (
    <form className="contactForm" onSubmit={handleSubmit}>
      <div className="contactFormHeading">
        <div>
          <p>{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
        </div>
        <span aria-hidden>
          <ArrowUpRight />
        </span>
      </div>

      <div className="contactFieldGrid">
        <label>
          <span>{copy.nameLabel}</span>
          <input
            autoComplete="name"
            name="name"
            placeholder={copy.namePlaceholder}
            required
          />
        </label>
        <label>
          <span>{copy.emailLabel}</span>
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            placeholder={copy.emailPlaceholder}
            required
            type="email"
          />
        </label>
      </div>

      <label>
        <span>{copy.topicLabel}</span>
        <select defaultValue={copy.topics[0]} name="topic" required>
          {copy.topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>{copy.messageLabel}</span>
        <textarea
          name="message"
          placeholder={copy.messagePlaceholder}
          required
          rows={6}
        />
      </label>

      <div className="contactFormFooter">
        <button type="submit">
          {copy.submitLabel}
          <Send aria-hidden />
        </button>
        <p>{copy.note}</p>
      </div>

      <p aria-live="polite" className="contactFormStatus">
        {prepared ? copy.prepared : ""}
      </p>
    </form>
  );
}
