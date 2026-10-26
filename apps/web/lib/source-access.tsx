"use client"

import { createContext, useContext } from "react"

/**
 * Where the source viewer reads a file, its passages and bytes, and whether the owner's own
 * tools (highlights, flashcards, Study, Details, "Right passage?") apply. A public folder's page
 * reads through its link and shows none of them.
 */
export type SourceAccess = { api: string; owner: boolean }

const SourceAccessContext = createContext<SourceAccess>({ api: "/api", owner: true })

export const SourceAccessProvider = SourceAccessContext.Provider
export const useSourceAccess = () => useContext(SourceAccessContext)
