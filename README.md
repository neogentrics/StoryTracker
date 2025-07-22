***
# Story Tracker v2.3.0

A professional, chapter-based authoring tool for writers, built with C# and WPF. This version introduces advanced import capabilities, including story outlines and support for a wider range of document formats.

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
    * **Advanced Import:** Import chapters from `.docx`, `.pdf` (text only), `.html`, and `.xaml` files.
    * **Story Outline Import:** Quickly build a new story structure by importing a simple text file with a title and chapter list.
    * **Chapter Import/Export:** Import chapters from `.txt` and `.rtf` files, or export individual chapters to various formats.
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
4.  Use the **"File"** menu to import existing documents/outlines or to export/print your work.
5.  Use the **"Settings"** menu to customize the application's theme and fonts.

---
## 🛠️ Technology Stack

* **C#** with **.NET**
* **WPF** (Windows Presentation Foundation)
* **PostgreSQL** for the database backend
* **Newtonsoft.Json** for data serialization
* **Npgsql** for database connectivity
* **DocX** and **iTextSharp** for file exporting/importing

---
## **Story Tracker: Official Development Roadmap**

This document outlines the history, current status, and planned features for future versions of the Story Tracker application.

### **v1.x: Foundation & Polish**

* **v1.0.0** - ✅ **Released**
    * Initial release with core functionality for storing stories as single documents.
* **v1.1.0** - ✅ **Released**
    * Implemented a secure, configurable login window with encrypted profiles.
* **v1.2.0** - ✅ **Released**
    * Implemented a full, multi-theme engine and advanced font customization.
    * Added auto-save, search, and refactored code into services.

---
### **v2.x: The Chapter & Editor Overhaul**

* **v2.0.0** - ✅ **Released**
    * Major architectural redesign to a chapter-based system with a `RichTextBox`.
* **v2.1.1** - ✅ **Released**
    * Implemented full story/chapter management (Add/Delete) and basic file export.
    * Added spell check and print preview.
* **v2.2.0** - ✅ **Released**
    * Implemented full-story export and import for `.txt` and `.rtf`.
* **v2.3.0** - ✅ **Released**
    * Implemented advanced import features, including Story Outline import and support for `.docx`, `.pdf`, `.html`, and `.xaml` files.

---
### **v3.x: Professional Authoring & Layout**

* **v3.0** - 🚧 **Current Version**
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
    * Implement an offline mode, a full user account system, and allow for custom theme/font importing.

* **v5.0: AI & Publishing** - 📅 **Planned**
    * Integrate with AI services, add ePub export, and implement a scriptwriting mode.

* **v6.0: Real-Time & Cloud** - 📅 **Planned**
    * Implement real-time collaboration, commenting, and a cloud-synced web version.