using Npgsql;
using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace StoryTracker
{
    public partial class MainWindow : Window
    {
        private readonly string _connectionString; // Store the connection string for later use
        private Story? _selectedStory;  // Use nullable type to handle the case when no story is selected
        private DispatcherTimer _autoSaveTimer; // Timer for auto-saving
        private List<Story> _allStories = new List<Story>(); // Store all stories to allow filtering

        public MainWindow(string connectionString)
        {
            InitializeComponent();
            _connectionString = connectionString; // Store the connection string for later use
            LoadStories(); // Load the stories from the database when the application starts
            SetPlaceholderText(); // Set the initial placeholder text for the search box

            // --- SETUP THE TIMER ---
            _autoSaveTimer = new DispatcherTimer();
            _autoSaveTimer.Interval = TimeSpan.FromMinutes(15); // Set the interval (e.g., 1 minute)
            _autoSaveTimer.Tick += AutoSaveTimer_Tick; // Assign the method to run
            _autoSaveTimer.Start(); // Start the timer
                                    // -----------------------
        }

        private void LoadStories()
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT StoryID, Title FROM Stories ORDER BY Title";
                using var command = new NpgsqlCommand(sql, connection);
                using var reader = command.ExecuteReader();

                _allStories.Clear(); // <-- ADD THIS LINE
                while (reader.Read())
                {
                    _allStories.Add(new Story { Id = reader.GetInt32(0), Title = reader.GetString(1) });
                }
                UpdateStoryListBox();
            }
            catch (NpgsqlException ex) { MessageBox.Show($"Database error: {ex.Message}"); }
        }

        // This new method will handle the filtering
        private void UpdateStoryListBox()
        {
            var searchText = SearchTextBox.Text;

            // Check if the search box is empty or just contains the placeholder text
            if (string.IsNullOrWhiteSpace(searchText) || searchText == "Search by Title...")
            {
                // If so, show the full list
                StoryListBox.ItemsSource = _allStories;
            }
            else
            {
                // Otherwise, show the filtered list
                var filteredStories = _allStories.Where(story =>
                    story.Title.Contains(searchText, StringComparison.OrdinalIgnoreCase)
                );
                StoryListBox.ItemsSource = filteredStories;
            }
        }

        // This is the new event handler for the search box
        private void SearchTextBox_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            UpdateStoryListBox();
        }

        // This method sets the placeholder text and styles for the search box
        private void SetPlaceholderText()
        {
            if (string.IsNullOrEmpty(SearchTextBox.Text))
            {
                SearchTextBox.Text = "Search by Title...";
                SearchTextBox.Foreground = Brushes.Gray;
                SearchTextBox.FontStyle = FontStyles.Italic;
            }
        }

        // This method handles the selection change in the ListBox
        private void StoryListBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (StoryListBox.SelectedItem is not Story selected)
            {
                ClearForm();
                return;
            }
            _selectedStory = new Story { Id = selected.Id };

            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT Title, StoryType, Genre, Status, WordCount, StoryText FROM Stories WHERE StoryID = @id";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("id", _selectedStory.Id);
                using var reader = command.ExecuteReader();
                if (reader.Read())
                {
                    TitleTextBox.Text = reader.GetString(0);
                    StoryTypeTextBox.Text = reader.IsDBNull(1) ? "" : reader.GetString(1);
                    GenreTextBox.Text = reader.IsDBNull(2) ? "" : reader.GetString(2);
                    StoryStatusTextBox.Text = reader.IsDBNull(3) ? "" : reader.GetString(3); // <-- UPDATED NAME
                    WordCountTextBlock.Text = reader.GetInt32(4).ToString();
                    StoryTextBox.Text = reader.IsDBNull(5) ? "" : reader.GetString(5);

                    AppStatusTextBlock.Text = $"Selected '{TitleTextBox.Text}'."; // <-- ADDED
                }
            }
            catch (NpgsqlException ex) { MessageBox.Show($"Database error: {ex.Message}"); }
        }

        // This method handles the Add button click event
        private void AddButton_Click(object sender, RoutedEventArgs e)
        {
            ClearForm();
            TitleTextBox.Focus();
            AppStatusTextBlock.Text = "Ready to create a new story."; // <-- ADDED
        }

        // This method handles the Edit button click event
        private void DeleteButton_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null || _selectedStory.Id == 0)
            {
                MessageBox.Show("Please select a story to delete.");
                return;
            }

            if (MessageBox.Show("Are you sure you want to permanently delete this story?", "Confirm Delete", MessageBoxButton.YesNo) == MessageBoxResult.Yes)
            {
                try
                {
                    using var connection = new NpgsqlConnection(_connectionString);
                    connection.Open();
                    var sql = "DELETE FROM Stories WHERE StoryID = @id";
                    using var command = new NpgsqlCommand(sql, connection);
                    command.Parameters.AddWithValue("id", _selectedStory.Id);
                    command.ExecuteNonQuery();

                    LoadStories();
                    ClearForm();
                    AppStatusTextBlock.Text = "Story successfully deleted."; // <-- ADDED
                }
                catch (NpgsqlException ex) { MessageBox.Show($"Database error: {ex.Message}"); }
            }
        }

        // This method handles the Save button click event
        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(TitleTextBox.Text))
            {
                MessageBox.Show("Title cannot be empty.");
                return;
            }

            var storyToSave = new Story
            {
                Id = _selectedStory?.Id ?? 0,
                Title = TitleTextBox.Text,
                StoryType = StoryTypeTextBox.Text,
                Genre = GenreTextBox.Text,
                Status = StoryStatusTextBox.Text, // <-- UPDATED NAME
                StoryText = StoryTextBox.Text,
                WordCount = StoryTextBox.Text.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length
            };

            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                string sql;
                if (storyToSave.Id == 0) // New story
                {
                    // Add LastUpdated to the INSERT statement
                    sql = "INSERT INTO Stories (Title, StoryType, Genre, Status, WordCount, StoryText, LastUpdated) VALUES (@title, @storyType, @genre, @status, @wordCount, @storyText, @lastUpdated)";
                }
                else // Existing story
                {
                    // Add LastUpdated to the UPDATE statement
                    sql = "UPDATE Stories SET Title = @title, StoryType = @storyType, Genre = @genre, Status = @status, WordCount = @wordCount, StoryText = @storyText, LastUpdated = @lastUpdated WHERE StoryID = @id";
                }

                using var command = new NpgsqlCommand(sql, connection);
                // ... (all the other parameters stay the same) ...
                command.Parameters.AddWithValue("status", storyToSave.Status);
                command.Parameters.AddWithValue("wordCount", storyToSave.WordCount);
                command.Parameters.AddWithValue("storyText", storyToSave.StoryText);

                // Add this new parameter for the current time
                command.Parameters.AddWithValue("lastUpdated", DateTime.UtcNow);

                if (storyToSave.Id != 0)
                {
                    command.Parameters.AddWithValue("id", storyToSave.Id);
                }

                command.ExecuteNonQuery();
                AppStatusTextBlock.Text = $"Story '{storyToSave.Title}' saved successfully.";
                LoadStories();
                MessageBox.Show("Saved successfully!");
            }
            catch (NpgsqlException ex) { MessageBox.Show($"Database error: {ex.Message}"); }
        }

        // This method clears the form fields and resets the selected story
        private void ClearForm()
        {
            _selectedStory = null;
            StoryListBox.SelectedItem = null;
            TitleTextBox.Text = "";
            StoryTypeTextBox.Text = "";
            GenreTextBox.Text = "";
            StoryStatusTextBox.Text = ""; // <-- UPDATED NAME
            WordCountTextBlock.Text = "--";
            StoryTextBox.Text = "";
            AppStatusTextBlock.Text = "Ready."; // <-- ADDED
        }

        // This method handles the auto-save functionality
        private void AutoSaveTimer_Tick(object? sender, EventArgs e)
        {
            // Ensure a story is open and has an ID (meaning it's not a "new" unsaved story)
            if (_selectedStory == null || _selectedStory.Id == 0)
            {
                return; // Do nothing if no story is open
            }

            // This logic is copied from SaveButton_Click, but without user messages
            var storyToSave = new Story
            {
                Id = _selectedStory.Id,
                Title = TitleTextBox.Text,
                StoryType = StoryTypeTextBox.Text,
                Genre = GenreTextBox.Text,
                Status = StoryStatusTextBox.Text,
                StoryText = StoryTextBox.Text,
                WordCount = StoryTextBox.Text.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length
            };

            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "UPDATE Stories SET Title = @title, StoryType = @storyType, Genre = @genre, Status = @status, WordCount = @wordCount, StoryText = @storyText, LastUpdated = @lastUpdated WHERE StoryID = @id";

                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("title", storyToSave.Title);
                command.Parameters.AddWithValue("storyType", storyToSave.StoryType);
                command.Parameters.AddWithValue("genre", storyToSave.Genre);
                command.Parameters.AddWithValue("status", storyToSave.Status);
                command.Parameters.AddWithValue("wordCount", storyToSave.WordCount);
                command.Parameters.AddWithValue("storyText", storyToSave.StoryText);
                command.Parameters.AddWithValue("lastUpdated", DateTime.UtcNow);
                command.Parameters.AddWithValue("id", storyToSave.Id);

                command.ExecuteNonQuery();

                // Update the status bar silently
                AppStatusTextBlock.Text = $"'{storyToSave.Title}' auto-saved at {DateTime.Now:T}";
            }
            catch (NpgsqlException)
            {
                // Don't show a popup for auto-save failures, just update the status
                AppStatusTextBlock.Text = "Auto-save failed.";
            }
        }

        // This method sets the placeholder text when the search box is empty
        private void SearchTextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            // If the text is the placeholder, clear it when the user clicks in
            if (SearchTextBox.Text == "Search by Title...")
            {
                SearchTextBox.Text = "";
                SearchTextBox.Foreground = Brushes.Black; // Or your theme's default text color
                SearchTextBox.FontStyle = FontStyles.Normal;
            }
        }

        // This method restores the placeholder text when the search box loses focus
        private void SearchTextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            // If the user clicks out and the box is empty, restore the placeholder
            SetPlaceholderText();
        }
    }
}