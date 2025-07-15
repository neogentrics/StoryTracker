# Story Tracker v1.2.0

A professional desktop application for writers to track and edit their work, built with C\# and WPF. This version is highly customizable, featuring a full theming system, font controls, and essential quality-of-life features like search and auto-save.

## ✨ Features

  * **Secure & Configurable Login:**
      * Launches with a login window to connect to a user-specified PostgreSQL database.
      * Saves and encrypts connection profiles for quick and secure access.
  * **Full Story Management (CRUD):**
      * **Create**, **Read**, **Update**, and **Delete** stories.
      * Edit all story details, including title, genre, status, and the full story text.
  * **Advanced Customization:**
      * **Theming Engine:** Choose from multiple themes (Light, Dark, High Contrast, and more) via the Settings menu. Your theme choice is saved between sessions.
      * **Global Font Control:** Change the font size and family for the entire application UI.
      * **Editor-Specific Fonts:** A separate mini-menu provides granular control over the font size, family, and color for the story text editor.
  * **Essential Writer Tools:**
      * **Live Search:** Instantly filter your story list by title using the search box.
      * **Auto-Save:** Automatically saves your work on the currently opened story every 15 minutes.
      * **"Last Updated" Timestamp:** Automatically tracks when each story was last modified.
      * **Automatic Word Count:** The word count is always up-to-date with your latest changes.

## 💻 How to Use

1.  Download the `.zip` file from the latest [release](https://www.google.com/search?q=https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/releases).
2.  Unzip the folder and run the `StoryTracker.exe` file.
3.  On the Login Window, enter the connection details for your PostgreSQL server. You can save these details for future use.
4.  Click "Connect" to launch the main application.
5.  Use the **Settings** menu to customize the application's theme and fonts to your preference.

## 🛠️ Technology Stack

  * **C\#** with **.NET**
  * **WPF** (Windows Presentation Foundation) for the user interface
  * **PostgreSQL** for the database backend
  * **Newtonsoft.Json** for data serialization
  * **Npgsql** as the .NET data provider for PostgreSQL
