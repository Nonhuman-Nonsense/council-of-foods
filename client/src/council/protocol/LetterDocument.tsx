import React from "react";
import parse from "html-react-parser";
import { marked } from "marked";
import { QRCodeCanvas } from "qrcode.react";
import type { TFunction } from "i18next";
import type { LetterView, PrintableLetterReply } from "@shared/ModelTypes";

/**
 * Letters and the replies to them, laid out as an email (docs/council-letters.md): the From / To
 * / Sent / Subject block with the QR code to the meeting beside it, the message, and REPLY at the
 * foot of every page of a reply. The same layout prints, downloads, and — via
 * {@link LetterHeader} — heads the letter on the summary screen.
 */

export interface LetterField {
  label: string;
  value: string;
}

/** Only a reply is titled, in English in every language, at the foot of each of its pages. */
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
  groups: LetterField[][];
  /** The type and spacing of the printed page (LETTER design V2). */
  paper?: boolean;
}

/**
 * One grid for every group, so a long label (Swedish "Meddelande:") widens the label column for
 * all of them. On paper the values start 21.7 mm from the margin, and the header stops short of
 * the QR code beside it.
 */
export function LetterHeader({ groups, paper = false }: LetterHeaderProps): React.ReactElement {
  const groupGap = paper ? "11.6px" : "0.7em";
  return (
    <div
      style={{
        display: "grid",
        ...(paper
          ? { gridTemplateColumns: "minmax(56.5px, max-content) 1fr", columnGap: "5px", fontSize: "10px", lineHeight: 1.22, paddingRight: "57px" }
          : { gridTemplateColumns: "8.5em 1fr" }),
      }}
    >
      {groups.flatMap((group, groupIndex) =>
        group.map((field, fieldIndex) => {
          const marginTop = groupIndex > 0 && fieldIndex === 0 ? groupGap : undefined;
          return (
            <React.Fragment key={field.label}>
              <b style={{ marginTop }}>{field.label}:</b>
              <span style={{ marginTop }}>{field.value}</span>
            </React.Fragment>
          );
        }),
      )}
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
  /** Where the QR code beside the header leads: the meeting. */
  qrUrl: string;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * The printed page. Never shown on screen — render it hidden and pass the element to
 * `createProtocolPdf`, which reads `data-layout` for the page geometry, the hidden QR code in
 * `data-meeting-qr` to stamp beside the header, and `data-page-stamp` to print at the foot of
 * every page.
 */
function LetterDocument({ title, groups, body, meetingId, qrUrl, ref }: LetterDocumentProps): React.ReactElement {
  return (
    <div ref={ref} data-layout="letter" data-page-stamp={title} className="letter-paper" style={{
      position: "absolute",
      top: 0,
      left: 0,
      width: `${LETTER_WIDTH_PX}px`,
      backgroundColor: "white",
      color: "black",
      textAlign: "left",
      fontFamily: '"Arimo", Arial, sans-serif',
      fontSize: "12px",
      lineHeight: 1.2,
    }}>
      <LetterHeader groups={groups} paper />
      <div style={{ marginTop: "43px" }}>
        <LetterBody text={body} />
      </div>
      <div data-meeting-qr={meetingId} style={{ display: "none" }}>
        <QRCodeCanvas value={qrUrl} size={256} />
      </div>
    </div>
  );
}

export default LetterDocument;
