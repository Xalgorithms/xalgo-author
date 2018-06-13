// Copyright 2018 Hayk Pilosyan <hayk.pilos@gmail.com>
// This file is part of Xalgo Authoring UI, a functional component of an
// Internet of Rules (IoR)
// ACKNOWLEDGEMENTS
// Funds: Xalgorithms Foundation
// Collaborators: Don Kelly, Joseph Potvin and Bill Olders.
// Licensed under the Apache License, Version 2.0 (the "License"); you
// may not use this file except in compliance with the License. You may
// obtain a copy of the License at
// http://www.apache.org/licenses/LICENSE-2.0
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
// implied. See the License for the specific language governing
// permissions and limitations under the License.

import CodeMirror from "codemirror";
import { exitCode } from "prosemirror-commands";
import { undo, redo } from "prosemirror-history";
import { TextSelection, Selection } from 'prosemirror-state';
import { schema } from "prosemirror-schema-basic";

class CodeBlockView {
  constructor(node, view, getPos) {
    // Store for later
    this.node = node
    this.view = view
    this.getPos = getPos

    // Create a CodeMirror instance
    this.cm = new CodeMirror(null, {
      value: this.node.textContent,
      lineNumbers: true,
      extraKeys: this.codeMirrorKeymap()
    })

    // The editor's outer node is our DOM representation
    this.dom = this.cm.getWrapperElement()
    // CodeMirror needs to be in the DOM to properly initialize, so
    // schedule it to update itself
    setTimeout(() => this.cm.refresh(), 20)

    // This flag is used to avoid an update loop between the outer and
    // inner editor
    this.updating = false
    // Propagate updates from the code editor to ProseMirror
    this.cm.on("cursorActivity",
               () => {if (!this.updating) this.forwardSelection()})
    this.cm.on("changes", () => {if (!this.updating) this.valueChanged()})
    this.cm.on("focus", () => this.forwardSelection())
  }

  forwardSelection() {
    if (!this.cm.hasFocus()) return
    let state = this.view.state
    let selection = this.asProseMirrorSelection(state.doc)
    if (!selection.eq(state.selection))
      this.view.dispatch(state.tr.setSelection(selection))
  }

  asProseMirrorSelection(doc) {
    let offset = this.getPos() + 1
    let anchor = this.cm.indexFromPos(this.cm.getCursor("anchor")) + offset
    let head = this.cm.indexFromPos(this.cm.getCursor("head")) + offset
    return TextSelection.create(doc, anchor, head)
  }

  setSelection(anchor, head) {
    this.cm.focus()
    this.updating = true
    this.cm.setSelection(this.cm.posFromIndex(anchor),
                         this.cm.posFromIndex(head))
    this.updating = false
  }

  valueChanged() {
    let change = computeChange(this.node.textContent, this.cm.getValue())
    if (change) {
      let start = this.getPos() + 1
      let tr = this.view.state.tr.replaceWith(
        start + change.from, start + change.to,
        change.text ? schema.text(change.text) : null)
      this.view.dispatch(tr)
    }
  }

  codeMirrorKeymap() {
    let view = this.view
    let mod = /Mac/.test(navigator.platform) ? "Cmd" : "Ctrl"
    return CodeMirror.normalizeKeyMap({
      Up: () => this.maybeEscape("line", -1),
      Left: () => this.maybeEscape("char", -1),
      Down: () => this.maybeEscape("line", 1),
      Right: () => this.maybeEscape("char", 1),
      [`${mod}-Z`]: () => undo(view.state, view.dispatch),
      [`Shift-${mod}-Z`]: () => redo(view.state, view.dispatch),
      [`${mod}-Y`]: () => redo(view.state, view.dispatch),
      "Ctrl-Enter": () => {
        if (exitCode(view.state, view.dispatch)) view.focus()
      }
    })
  }

  maybeEscape(unit, dir) {
    let pos = this.cm.getCursor()
    if (this.cm.somethingSelected() ||
        pos.line !== (dir < 0 ? this.cm.firstLine() : this.cm.lastLine()) ||
        (unit === "char" &&
         pos.ch !== (dir < 0 ? 0 : this.cm.getLine(pos.line).length)))
      return CodeMirror.Pass
    this.view.focus()
    let targetPos = this.getPos() + (dir < 0 ? 0 : this.node.nodeSize)
    let selection = Selection.near(this.view.state.doc.resolve(targetPos), dir)
    this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView())
    this.view.focus()
  }

  update(node) {
    if (node.type !== this.node.type) return false
    this.node = node
    let change = computeChange(this.cm.getValue(), node.textContent)
    if (change) {
      this.updating = true
      this.cm.replaceRange(change.text, this.cm.posFromIndex(change.from),
                           this.cm.posFromIndex(change.to))
      this.updating = false
    }
    return true
  }

  selectNode() { this.cm.focus() }
  stopEvent() { return true }
}

function computeChange(oldVal, newVal) {
  if (oldVal === newVal) return null
  let start = 0, oldEnd = oldVal.length, newEnd = newVal.length
  while (start < oldEnd && oldVal.charCodeAt(start) === newVal.charCodeAt(start)) ++start
  while (oldEnd > start && newEnd > start &&
         oldVal.charCodeAt(oldEnd - 1) === newVal.charCodeAt(newEnd - 1)) { oldEnd--; newEnd-- }
  return {from: start, to: oldEnd, text: newVal.slice(start, newEnd)}
}

export default CodeBlockView;