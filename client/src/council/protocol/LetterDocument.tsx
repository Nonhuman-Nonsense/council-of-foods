import React from "react";
import parse from "html-react-parser";
import { marked } from "marked";
import { QRCodeCanvas } from "qrcode.react";
import type { TFunction } from "i18next";
import type { LetterView, PrintableLetterReply } from "@shared/ModelTypes";

/**
 * Letters and the replies to them, laid out as an email (docs/council-letters.md): REPLY
 * centred above a reply, the From / To / Sent / Subject block, the message, and the QR code to the meeting at
 * the foot of every page. The same layout prints, downloads, and — via {@link LetterHeader} —
 * heads the letter on the summary screen.
 */

export interface LetterField {
  label: string;
  value: string;
}

/** Only a reply is titled, in English in every language; a letter starts at its From line. */
export type LetterTitle = "REPLY";

/** Width of the document in CSS px; the PDF lays it out at one px to the point. */
export const LETTER_WIDTH_PX = 454;

const ADDRESSED = (name: string, email: string | null | undefined): string => (email ? `${name} <${email}>` : name);

/** A date and time as an email client writes it: "Tuesday 15 October 2026 at 11:27". */
export function formatLetterDate(iso: string, language: string): string {
  return new Date(iso).toLocaleString(language === "sv" ? "sv-SE" : "en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** A letter's header: who wrote it, to whom, and when — in groups, as the sketch spaces them. */
export function letterFields(letter: LetterView, t: TFunction, language: string): LetterField[][] {
  const recipient = letter.recipientOrganisation
    ? `${letter.recipientName}, ${letter.recipientOrganisation}`
    : letter.recipientName;
  return [
    [
      { label: t("letter.from"), value: ADDRESSED(letter.authorName, letter.authorEmail) },
      { label: t("letter.to"), value: ADDRESSED(recipient, letter.recipientEmail) },
    ],
    [
      ...(letter.sentAt ? [{ label: t("letter.sent"), value: formatLetterDate(letter.sentAt, language) }] : []),
      { label: t("letter.subject"), value: letter.subject },
      { label: t("letter.message"), value: "" },
    ],
  ];
}

/** A reply's header, in the language of the letter it answers. */
export function replyFields(reply: PrintableLetterReply, t: TFunction): LetterField[][] {
  return [
    [{ label: t("letter.replyFrom"), value: reply.fromName ? ADDRESSED(reply.fromName, reply.fromAddress) : reply.fromAddress }],
    [
      { label: t("letter.received"), value: formatLetterDate(reply.receivedAt, reply.letter.language) },
      { label: t("letter.subject"), value: reply.subject || reply.letter.subject },
      { label: t("letter.message"), value: "" },
    ],
  ];
}

interface LetterHeaderProps {
  title?: LetterTitle;
  groups: LetterField[][];
  /** The wider spacing of the printed page. */
  paper?: boolean;
}

export function LetterHeader({ title, groups, paper = false }: LetterHeaderProps): React.ReactElement {
  return (
    <div>
      {title && (
        <h2 style={{ textAlign: "center", fontWeight: "bold", fontSize: "1.45em", margin: paper ? "14px 0 29px" : "0 0 1.2em" }}>
          {title}
        </h2>
      )}
      {groups.map((group) => (
        <div
          key={group.map((field) => field.label).join()}
          style={{ display: "grid", gridTemplateColumns: "8.5em 1fr", marginTop: group === groups[0] ? 0 : "0.7em" }}
        >
          {group.map((field) => (
            <React.Fragment key={field.label}>
              <b>{field.label}:</b>
              <span>{field.value}</span>
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The message of a letter or reply: plain text, its line breaks kept as written. */
export function LetterBody({ text }: { text: string }): React.ReactElement {
  return <div className="letter-body">{parse(marked.parse(text, { async: false, breaks: true }) as string)}</div>;
}

interface LetterDocumentProps {
  title?: LetterTitle;
  groups: LetterField[][];
  body: string;
  meetingId: string | number;
  /** Where the QR code at the foot of each page leads: the meeting. */
  qrUrl: string;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * The printed page. Never shown on screen — render it hidden and pass the element to
 * `createProtocolPdf`, which reads `data-layout` for the page geometry and the hidden
 * `data-page-footer` QR code to stamp at the foot of every page.
 */
function LetterDocument({ title, groups, body, meetingId, qrUrl, ref }: LetterDocumentProps): React.ReactElement {
  return (
    <div ref={ref} data-layout="letter" style={{
      position: "absolute",
      top: 0,
      left: 0,
      width: `${LETTER_WIDTH_PX}px`,
      backgroundColor: "white",
      color: "black",
      textAlign: "left",
      fontFamily: '"Arimo", Arial, sans-serif',
      fontSize: "11px",
      lineHeight: 1.35,
    }}>
      <LetterHeader title={title} groups={groups} paper />
      <div style={{ marginTop: "22px" }}>
        <LetterBody text={body} />
      </div>
      <div data-page-footer={`Meeting #${meetingId}`} style={{ display: "none" }}>
        <QRCodeCanvas value={qrUrl} size={256} />
      </div>
    </div>
  );
}

export default LetterDocument;
