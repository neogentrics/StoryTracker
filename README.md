# Story Tracker v1.1

A desktop application for writers to track and edit their stories, built with C\# and WPF. This version features a secure, configurable login system and a polished user interface.

## ✨ Features

  * **Secure Login System:**
      * Application launches to a login window to connect to a user-specified database.
      * Connection profiles can be saved for quick access.
      * Saved connection information is stored locally in an **encrypted** file.
  * **Full Story Management (CRUD):**
      * **Create**, **Read**, **Update**, and **Delete** stories.
      * Edit all story details, including title, genre, status, and the full story text.
  * **Polished User Interface:**
      * Modern **dark theme** applied across the application.
      * **Icons** on buttons for intuitive actions.
      * A **status bar** provides real-time feedback on application actions.
      * Resizable UI panels for a comfortable user experience.
  * **Automatic Word Count:** The word count is automatically calculated and saved whenever story text is changed.

## 💻 How to Use

1.  Download the `.zip` file from the latest [release](https://www.google.com/search?q=https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/releases).
2.  Unzip the folder and run the `StoryTracker.exe` file.
3.  On the Login Window, enter the connection details for your PostgreSQL server. You can save these details for future use.
4.  Click "Connect" to launch the main application.

## 🛠️ Technology Used

  * **C\#** with **.NET**
  * **WPF** for the user interface
  * **PostgreSQL** for the database backend
  * **Newtonsoft.Json** for data serialization
  * **Npgsql** as the .NET data provider for PostgreSQL
