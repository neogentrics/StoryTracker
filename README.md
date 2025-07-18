
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

