Here is the updated `README.md` file for your v2.2.0 release.

***
# Story Tracker v2.2.0

A professional, chapter-based authoring tool for writers, built with C# and WPF. This version features a comprehensive import/export system, allowing for seamless integration with other writing tools and formats.

---
## ✨ Features

* **Chapter-Based Writing:**
    * Organize your stories into individual **chapters**.
    * Easily **add, delete, and navigate** stories and chapters.

* **Powerful Rich Text Editor:**
    * Full formatting controls: **Bold**, *Italic*, Underline, Strikethrough, Alignment, Lists, and more.
    * Customize font family, size, and color for selected text.
    * Live word and character counts update as you type.

* **Comprehensive Import/Export System:**
    * **Full Story Export:** Export an entire story with all chapters combined into a single `.rtf`, `.docx`, or `.pdf` file.
    * **Chapter Import/Export:** Import chapters from `.txt` and `.rtf` files, or export individual chapters to `.txt`, `.rtf`, `.docx`, and `.pdf`.
    * **Print Preview & Printing:** Preview and print individual chapters or the entire story.

* **Advanced Customization & Tools:**
    * **Full Theming Engine:** Choose from multiple themes, including Light, Dark, High Contrast, and a semi-transparent "Aero" glass theme.
    * **Integrated Spell Checker:** Features a built-in spell checker with a custom dictionary.
    * **Auto-Save:** Automatically saves your work on the currently opened chapter.

* **Secure & Configurable Login:**
    * Connects to a user-specified PostgreSQL database.
    * Saves and **encrypts** connection profiles for quick and secure access.

---
## 💻 How to Use

1.  Download the `.zip` file from the latest release.
2.  Unzip the folder and run the `StoryTracker.exe` file.
3.  On the Login Window, enter the connection details for your PostgreSQL server.
4.  Use the **"File"** menu to import existing documents or to export/print your work.
5.  Use the **"Settings"** menu to customize the application's theme and fonts.

---
## 🛠️ Technology Stack

* **C#** with **.NET**
* **WPF** (Windows Presentation Foundation)
* **PostgreSQL** for the database backend
* **Newtonsoft.Json** for data serialization
* **Npgsql** for database connectivity
* **DocX** and **iTextSharp** for file exporting

* ----------------------------------------------------------

***

Here is the complete project roadmap.

***
## **Story Tracker: Official Development Roadmap**

This document outlines the history, current status, and planned features for future versions of the Story Tracker application.

---
### **v1.x: Foundation & Polish**

* **v1.0.0** - ✅ **Released**
    * Initial release.
    * Core functionality for storing stories as single documents.
    * Basic data structures and database connection.

* **v1.1.0** - ✅ **Released**
    * Implemented a secure, configurable login window.
    * Added the ability to save/delete encrypted connection profiles.
    * Introduced the first UI polish, including a dark theme and status bar.

* **v1.2.0** - ✅ **Released**
    * Implemented a full, multi-theme engine with accessibility options.
    * Added global and editor-specific font customization.
    * Introduced auto-save, "Last Updated" timestamps, and a live search filter.
    * Refactored database logic into a `DatabaseService` with error logging.

---
### **v2.x: The Chapter & Editor Overhaul**

* **v2.0.0** - ✅ **Released**
    * Major architectural redesign to a chapter-based system.

* **v2.1.1** - ✅ **Released**
    * Implemented story management (Add/Delete) and basic file export (`.txt`, `.rtf`).
    * Added spell check and print preview.

* **v2.2.0** - ✅ **Released**
    * Implemented full-story export to `.rtf`, `.docx`, and `.pdf`.
    * Implemented chapter import from `.txt` and `.rtf`.

* **v2.3.0** - 🚧 **Current Version**
    * Implement the "Import Story Outline" feature.
    * Add support for importing from Microsoft Word (`.docx`) and PDF (`.pdf`).
    * Add support for importing and exporting to HTML and XML formats.

---
### **v3.x: Professional Authoring & Layout**

* **v3.0** - 📅 **Planned**
    * **Page Layout System:** Implement a "Page Setup" dialog with support for standard book sizes (e.g., 6x9, 8.5x11) and customizable margins.

* **v3.1** - 📅 **Planned**
    * **Page Elements:** Add the ability to define and edit headers, footers, and automatic page numbers for exports.

* **v3.2** - 📅 **Planned**
    * **Advanced Content:** Implement support for inserting images and creating tables within the rich text editor.

* **v3.3** - 📅 **Planned**
    * **Final Formatting Tools:** Add a "Clear Formatting" button and a feature to automatically generate a Table of Contents.

---
### **v4.0 and Beyond: The Cloud & Collaboration Era**

* **v4.0: Collaboration & Accessibility** - 📅 **Planned**
    * Implement an offline mode with local storage and database synchronization.
    * Create a full user account system.
    * Allow users to create and import their own theme and font files.

* **v5.0: AI & Publishing** - 📅 **Planned**
    * Integrate with AI services (like Gemini) for grammar checks, summaries, and idea generation.
    * Add support for exporting to publishing-specific formats like **ePub**.
    * Implement a dedicated scriptwriting mode.

* **v6.0: Real-Time & Cloud** - 📅 **Planned**
    * Implement real-time, Google Docs-style collaboration.
    * Add commenting and "track changes" features.
    * Develop a cloud-synced web version of the application.

***
