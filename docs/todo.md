# V1 follow-up notes

- Keep the current VS Code 1.96.0 minimum lane in the release gate.
- Revisit the `parse5` transitive `entities` Node engine metadata when a
  compatible pinned release is available; the bundled EPUB path is already
  covered by the minimum Extension Host lane.
- Consider installing a coverage provider only when the project explicitly
  accepts the added dependency and its license/audit review.
- Reassess realtime cross-window notifications only with an explicit product
  requirement; V1 documents refresh-boundary behavior instead.
