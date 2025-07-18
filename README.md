
## Updated `README.md` for v2.0.0

# Story Tracker v2.0.0

A professional, chapter-based authoring tool for writers, built with C\# and WPF. This application provides a powerful rich text editor and a highly customizable, theme-aware interface to manage and write your stories.

-----

## ✨ Features

  * **Chapter-Based Writing:**
      * Organize your stories into individual **chapters**.
      * Easily add, delete, and navigate chapters within each story.
  * **Powerful Rich Text Editor:**
      * Full formatting controls: **Bold**, *Italic*, Underline, Strikethrough, and more.
      * Customize font family, size, and color for selected text.
      * Create bulleted and numbered lists, and adjust text alignment and indentation.
      * Live word and character counts update as you type.
  * **Advanced Customization:**
      * **Full Theming Engine:** Choose from multiple themes, including Light, Dark, High Contrast, and a semi-transparent "Aero" glass theme. Your choice is saved between sessions.
      * **Custom Button Styles:** Application buttons feature unique, theme-aware image backgrounds.
      * **Global Font Control:** Change the font size and family for the entire application UI.
  * **Secure & Configurable Login:**
      * Connects to a user-specified PostgreSQL database.
      * Saves and **encrypts** connection profiles for quick and secure access.

## 💻 How to Use

1.  Download the `.zip` file from the latest [release](https://www.google.com/search?q=https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/releases).
2.  Unzip the folder and run the `StoryTracker.exe` file.
3.  On the Login Window, enter the connection details for your PostgreSQL server.
4.  Select a story from the left-most list to view its chapters.
5.  Select a chapter from the middle list to load its content into the rich text editor.

## 🛠️ Technology Stack

  * **C\#** with **.NET**
  * **WPF** (Windows Presentation Foundation) for the user interface
  * **PostgreSQL** for the database backend
  * **Newtonsoft.Json** for data serialization
  * **Npgsql** as the .NET data provider for PostgreSQL

    
----------------------------------------------------------------------------------------------

# Release Notes for v2.0.0

This is a landmark release for the **Story Tracker**, representing a complete architectural overhaul to transform the application from a simple document editor into a powerful, multi-chapter authoring tool. Version 2.0 introduces a chapter-based data model, a full rich text editor, and a redesigned user interface to support a more professional writing workflow.

-----

## ✨ Major New Features & Architectural Changes

  * **Chapter-Based System:**

      * The database schema has been redesigned to support a one-to-many relationship between stories and chapters.
      * The main UI now features a three-column layout to navigate stories, the chapters within them, and the chapter text itself.
      * Users can now **add** and **delete** individual chapters within a story.

  * **Rich Text Editor:**

      * The simple text box has been replaced with a powerful **Rich Text Editor**.
      * A full formatting toolbar has been implemented, including:
          * Standard clipboard actions (Cut, Copy, Paste, Undo, Redo).
          * Text styling (**Bold**, *Italic*, Underline, Strikethrough, Subscript, Superscript).
          * Paragraph formatting (Left, Center, Right, and Justify alignment).
          * List creation (Bulleted and Numbered lists).
          * Indentation controls.
      * **Live word and character counts** now provide real-time feedback as you type.

  * **Advanced UI & Theming:**

      * **Custom Button Styles:** Standard application buttons now use theme-aware, image-based backgrounds for a unique, polished look.
      * **Custom Toolbar:** The rich text editor toolbar features custom image-based icons for all functions.
      * **Frosted Glass Effect (Aero Theme):** A semi-transparent, acrylic blur effect has been added to the main window for a modern "frosted glass" look, which is most prominent with the Aero theme.

## 💻 Technical Improvements

  * The `DatabaseService` has been completely rewritten to support the new story/chapter data model.
  * The C\# code-behind for the `MainWindow` has been refactored to handle the new three-column UI and the `RichTextBox` control.


***

## **Story Tracker: Official Development Roadmap**

This document outlines the planned features and architectural changes for future versions of the Story Tracker application.

### **v2.1: The "Export & Polish" Release** 🖋️

This version focuses on getting your work out of the application and adding essential editor functionality.

* **Enable Built-in Spell Check:** Activate the native spell checker within the rich text editor.
* **Export Chapter to File:** Implement the "File > Export Chapter As..." functionality.
    * **Initial formats:** Plain Text (`.txt`) and Rich Text Format (`.rtf`).
* **Improved Dialogs:** Make confirmation messages more informative (e.g., including the story or chapter title).
* **Add "Select All" to Menu:** Include a "Select All" option under an "Edit" menu for discoverability.

---

### **v2.2: The "Advanced Export & Import" Release** ↔️

This version will add more complex file interactions and make the editor more powerful.

* **Full Story Export:** Add the ability to export an entire story (all chapters combined) into a single document.
* **Advanced Export Formats:**
    * Microsoft Word (`.docx`).
    * HTML (`.html`).
    * PDF (`.pdf`).
* **Import from Files:** Create a system to import existing `.txt` or `.rtf` files as new chapters.
* **Print Functionality:** Add a "File > Print" option to print the content of the current chapter.

---

### **v3.0: The "Professional Authoring" Release** 📖

This is a major architectural update focused on book formatting and professional output.

* **Full Page Layout System:**
    * Implement a "Page Setup" dialog.
    * Support for standard book sizes (6x9, 8x11, etc.).
    * Customizable margins.
* **Headers, Footers, & Page Numbers:** Add the ability to define and edit headers and footers, with automatic page numbering.
* **Table of Contents Generation:** Create a feature to automatically generate a table of contents based on chapter titles.
* **Image Support:**
    * Allow users to insert images into the rich text editor.
    * Update the database to store and retrieve these images.
    * Ensure images are included in all export formats.
* **Advanced Formatting:**
    * Support for creating and styling tables.
    * Add "WordArt" or other decorative text features.
    * Implement "Clear Formatting" button.

---

### **v4.0: The "Collaboration & Accessibility" Release** 👥

This version focuses on making the app work for multiple users and in different environments.

* **Offline Mode:**
    * Implement a local database (like SQLite) for offline work.
    * Create a robust synchronization system to push local changes to the main server database when a connection is available.
* **User Account System:**
    * Implement a user login system for the main database.
    * Ensure users can only see and edit their own stories.
* **Dynamic Theming & Fonts:**
    * Allow users to create and import their own theme files.
    * Allow users to add and use their own font files.
* **UI Customization:** Add a "Preferences" window where users can customize the editor toolbar.

---

### **v5.0: The "AI & Publishing" Release** 🤖

This is a forward-looking release focused on advanced assistance and direct publishing.

* **AI Integration:**
    * Create a system for users to input their API keys for services like Gemini.
    * Implement features for summarization, grammar checks, and idea generation.
* **Advanced Publishing Formats:**
    * Add support for exporting to publishing-specific formats like **ePub** (for Kindle, etc.).
* **Scriptwriting Mode:** Implement a special mode with formatting tools for writing plays or screenplays.

---

***


## **v6.0 and Beyond: The "Cloud & Collaboration" Releases** ☁️

This phase focuses on transforming Story Tracker from a personal authoring tool into a collaborative, cloud-based platform.

* **Real-Time Collaboration:** Go beyond simple file sharing and implement a Google Docs-style system where multiple users can edit the same chapter simultaneously, seeing each other's cursors and changes in real-time.

* **Commenting & Track Changes:** Add the ability for collaborators and editors to leave comments in the margins and to make edits that can be accepted or rejected by the story's owner.

* **Cloud Sync & Web Version:** Transition from a self-hosted database to a cloud-based backend. This would be the foundation for a full web-based version of Story Tracker, allowing users to access and edit their work from any device with a web browser.

* **Version History & Snapshots:** Implement a system that automatically saves "snapshots" of each chapter, allowing writers to view and restore previous versions of their work at any time.

* **Mobile Companion App:** Create a simple, lightweight mobile app (for iOS/Android) that allows writers to review their work, jot down notes, and make quick edits on the go.

* **Advanced Analytics:** Provide a "dashboard" for writers that offers insights into their work, such as writing pace (words per day), most frequently used words, readability scores, and character dialogue analysis.

* **Plugin & Add-on Support:** Create a plugin architecture that would allow other developers to build and share their own add-ons, such as new export formats, custom themes, or integrations with other writing services.
