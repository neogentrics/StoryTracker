using Npgsql;
using System.Collections.Generic;
using System.Windows;

namespace StoryTracker
{
    public partial class MainWindow : Window
    {
        // Replace this with your actual connection details
        private readonly string _connectionString = "Host=YOUR_OMV_IP;Username=your_username;Password=your_strong_password;Database=your_database_name";

        public MainWindow()
        {
            InitializeComponent();
            LoadStories();
        }

        private void LoadStories()
        {
            var storyTitles = new List<string>();

            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();

                var sql = "SELECT Title FROM Stories ORDER BY Title";
                using var command = new NpgsqlCommand(sql, connection);

                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    storyTitles.Add(reader.GetString(0));
                }

                // This is the key part that connects your data to the UI
                StoryListBox.ItemsSource = storyTitles;
            }
            catch (NpgsqlException ex)
            {
                MessageBox.Show($"Database connection error: {ex.Message}");
            }
        }
    }
}