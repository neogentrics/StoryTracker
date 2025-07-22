We are ready to start **v2.2**.

Here is the updated `README.md` file that reflects all the great features you added in the v2.1.1 release.

***
# Story Tracker v2.1.1

A professional, chapter-based authoring tool for writers, built with C# and WPF. This version adds essential productivity features including file exporting and an integrated spell checker, building on the powerful v2.0 foundation.

---
## ✨ Features

* **Chapter-Based Writing:**
    * Organize your stories into individual **chapters**.
    * Easily **add, delete, and navigate** stories and chapters.

* **Powerful Rich Text Editor:**
    * Full formatting controls: **Bold**, *Italic*, Underline, Strikethrough, Alignment, Lists, and more.
    * Customize font family, size, and color for selected text.
    * Live word and character counts update as you type.

* **Editing & Export Tools:**
    * **Integrated Spell Checker:** Features a built-in spell checker with a custom dictionary, which can be toggled via the "Edit" menu.
    * **Chapter Export:** Save the current chapter to your computer in **Plain Text (`.txt`)** or **Rich Text Format (`.rtf`)**.
    * **Print Preview & Printing:** A "File > Print Preview" option provides a clean, read-only view of your chapter with a direct-to-printer function.

* **Advanced Customization:**
    * **Full Theming Engine:** Choose from multiple themes, including Light, Dark, High Contrast, and a semi-transparent "Aero" glass theme. Your choice is saved between sessions.
    * **Custom Button Styles:** Application buttons feature unique, theme-aware image backgrounds.
    * **Global Font Control:** Change the font size and family for the entire application UI.

* **Secure & Configurable Login:**
    * Connects to a user-specified PostgreSQL database.
    * Saves and **encrypts** connection profiles for quick and secure access.

---
## 💻 How to Use

1.  Download the `.zip` file from the latest release.
2.  Unzip the folder and run the `StoryTracker.exe` file.
3.  On the Login Window, enter the connection details for your PostgreSQL server.
4.  Select a story from the left-most list to view its chapters.
5.  Select a chapter from the middle list to load its content into the rich text editor.
6.  Use the **"File"** menu to export or preview your work, and the **"Edit"** menu to toggle spell check.

---
## 🛠️ Technology Stack

* **C#** with **.NET**
* **WPF** (Windows Presentation Foundation) for the user interface
* **PostgreSQL** for the database backend
* **Newtonsoft.Json** for data serialization
* **Npgsql** as the .NET data provider for PostgreSQL

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
    * Database refactored with `Stories` and `Chapters` tables.
    * UI redesigned into a three-column layout.
    * Replaced `TextBox` with a powerful `RichTextBox`.
    * Implemented a full formatting toolbar with image-based icons.

* **v2.1.1** - ✅ **Released**
    * Implemented "Add Story" and "Delete Story" functionality.
    * Added chapter export to Plain Text (`.txt`) and Rich Text Format (`.rtf`).
    * Integrated a full-featured spell checker with a custom dictionary.
    * Added a Print Preview window with a "Print" button.

### **Updated Roadmap: The v2.2.x "Import/Export & Polish" Series**

  * **v2.2.0 (Bug Fix & Polish Release)** - 🚧 **Current Version**

      * Fix bug where story-level total word count is not displayed.
      * Fix bug where button text disappears in the Aero theme.
      * Add a live-updating total word count for the selected story.

  * **v2.2.1 (Import Release)** - 📅 **Planned**

      * Create a system to import existing `.txt` or `.rtf` files as new chapters.
      * Implement the "Import Story Outline" feature from a CSV or text file.

  * **v2.2.2 (Advanced Import/Export Release)** - 📅 **Planned**

      * Add support for importing/exporting to Microsoft Word (`.docx`) and PDF (`.pdf`).
      * Add support for importing/exporting to HTML and XML.

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
