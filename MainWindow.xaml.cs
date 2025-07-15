using Npgsql;
using System.Collections.Generic;
using System.Windows;

namespace StoryTracker
{
    public partial class MainWindow : Window
    {
        private readonly string _connectionString = "Host=104.181.3.1;Username=fighttoby;Password=Mudpuppy@2025!;Database=recontowersdb";
        private Story? _selectedStory; // To keep track of the currently selected story

        public MainWindow()
        {
            InitializeComponent();
            LoadStories();
        }

        private void LoadStories()
        {
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
            _selectedStory = new Story { Id = selected.Id }; // Store the selected ID

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
                    StatusTextBox.Text = reader.IsDBNull(3) ? "" : reader.GetString(3);
                    WordCountTextBlock.Text = reader.GetInt32(4).ToString();
                    StoryTextBox.Text = reader.IsDBNull(5) ? "" : reader.GetString(5);
                }
            }
            catch (NpgsqlException ex) { MessageBox.Show($"Database error: {ex.Message}"); }
        }

        private void AddButton_Click(object sender, RoutedEventArgs e)
        {
            ClearForm();
            TitleTextBox.Focus();
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

                    LoadStories(); // Refresh the list
                    ClearForm();
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
                Id = _selectedStory?.Id ?? 0, // Use existing ID or 0 for new story
                Title = TitleTextBox.Text,
                StoryType = StoryTypeTextBox.Text,
                Genre = GenreTextBox.Text,
                Status = StatusTextBox.Text,
                StoryText = StoryTextBox.Text,
                WordCount = StoryTextBox.Text.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length
            };

            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                string sql;
                if (storyToSave.Id == 0) // This is a new story
                {
                    sql = "INSERT INTO Stories (Title, StoryType, Genre, Status, WordCount, StoryText) VALUES (@title, @storyType, @genre, @status, @wordCount, @storyText)";
                }
                else // This is an existing story
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
                MessageBox.Show("Saved successfully!");
                LoadStories(); // Refresh list to show changes
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
            StatusTextBox.Text = "";
            WordCountTextBlock.Text = "--";
            StoryTextBox.Text = "";
        }
    }
}