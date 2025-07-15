using Npgsql;
using System;
using System.Collections.Generic;
using System.Windows;

namespace StoryTracker
{
    public partial class MainWindow : Window
    {
        private readonly string _connectionString;
        private Story? _selectedStory;

        public MainWindow(string connectionString)
        {
            InitializeComponent();
            _connectionString = connectionString;
            LoadStories();
        }

        private void LoadStories()
        {
            // ... (This method is correct and needs no changes)
            var stories = new List<Story>();
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT StoryID, Title FROM Stories ORDER BY Title";
                using var command = new NpgsqlCommand(sql, connection);
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    stories.Add(new Story { Id = reader.GetInt32(0), Title = reader.GetString(1) });
                }
                StoryListBox.ItemsSource = stories;
            }
            catch (NpgsqlException ex) { MessageBox.Show($"Database error: {ex.Message}"); }
        }

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

        private void AddButton_Click(object sender, RoutedEventArgs e)
        {
            ClearForm();
            TitleTextBox.Focus();
            AppStatusTextBlock.Text = "Ready to create a new story."; // <-- ADDED
        }

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
                if (storyToSave.Id == 0)
                {
                    sql = "INSERT INTO Stories (Title, StoryType, Genre, Status, WordCount, StoryText) VALUES (@title, @storyType, @genre, @status, @wordCount, @storyText)";
                }
                else
                {
                    sql = "UPDATE Stories SET Title = @title, StoryType = @storyType, Genre = @genre, Status = @status, WordCount = @wordCount, StoryText = @storyText WHERE StoryID = @id";
                }

                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("title", storyToSave.Title);
                command.Parameters.AddWithValue("storyType", storyToSave.StoryType);
                command.Parameters.AddWithValue("genre", storyToSave.Genre);
                command.Parameters.AddWithValue("status", storyToSave.Status);
                command.Parameters.AddWithValue("wordCount", storyToSave.WordCount);
                command.Parameters.AddWithValue("storyText", storyToSave.StoryText);
                if (storyToSave.Id != 0)
                {
                    command.Parameters.AddWithValue("id", storyToSave.Id);
                }

                command.ExecuteNonQuery();
                AppStatusTextBlock.Text = $"Story '{storyToSave.Title}' saved successfully."; // <-- ADDED
                LoadStories();
                MessageBox.Show("Saved successfully!");
            }
            catch (NpgsqlException ex) { MessageBox.Show($"Database error: {ex.Message}"); }
        }

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
    }
}