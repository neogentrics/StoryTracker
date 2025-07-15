using Npgsql;
using System;
using System.Collections.Generic;
using System.IO;

namespace StoryTracker
{
    public class DatabaseService
    {
        private readonly string _connectionString;

        public DatabaseService(string connectionString)
        {
            _connectionString = connectionString;
        }

        public List<Story> LoadStoryTitles()
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
            }
            catch (Exception ex)
            {
                LogError(ex);
                throw new Exception("Could not load stories from the database. See log.txt for details.");
            }
            return stories;
        }

        public Story GetStoryDetails(int storyId)
        {
            var story = new Story();
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT Title, StoryType, Genre, Status, WordCount, StoryText FROM Stories WHERE StoryID = @id";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("id", storyId);
                using var reader = command.ExecuteReader();
                if (reader.Read())
                {
                    story.Id = storyId;
                    story.Title = reader.GetString(0);
                    story.StoryType = reader.IsDBNull(1) ? "" : reader.GetString(1);
                    story.Genre = reader.IsDBNull(2) ? "" : reader.GetString(2);
                    story.Status = reader.IsDBNull(3) ? "" : reader.GetString(3);
                    story.WordCount = reader.GetInt32(4);
                    story.StoryText = reader.IsDBNull(5) ? "" : reader.GetString(5);
                }
            }
            catch (Exception ex)
            {
                LogError(ex);
                throw new Exception($"Could not load details for story ID {storyId}. See log.txt for details.");
            }
            return story;
        }

        public void SaveStory(Story storyToSave)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                string sql;
                if (storyToSave.Id == 0) // New story
                {
                    sql = "INSERT INTO Stories (Title, StoryType, Genre, Status, WordCount, StoryText, LastUpdated) VALUES (@title, @storyType, @genre, @status, @wordCount, @storyText, @lastUpdated)";
                }
                else // Existing story
                {
                    sql = "UPDATE Stories SET Title = @title, StoryType = @storyType, Genre = @genre, Status = @status, WordCount = @wordCount, StoryText = @storyText, LastUpdated = @lastUpdated WHERE StoryID = @id";
                }

                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("title", storyToSave.Title);
                command.Parameters.AddWithValue("storyType", storyToSave.StoryType);
                command.Parameters.AddWithValue("genre", storyToSave.Genre);
                command.Parameters.AddWithValue("status", storyToSave.Status);
                command.Parameters.AddWithValue("wordCount", storyToSave.WordCount);
                command.Parameters.AddWithValue("storyText", storyToSave.StoryText);

                var lastUpdatedParam = command.CreateParameter();
                lastUpdatedParam.ParameterName = "lastUpdated";
                lastUpdatedParam.Value = DateTime.UtcNow;
                lastUpdatedParam.NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.TimestampTz;
                command.Parameters.Add(lastUpdatedParam);

                if (storyToSave.Id != 0)
                {
                    command.Parameters.AddWithValue("id", storyToSave.Id);
                }
                command.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                LogError(ex);
                throw new Exception("Could not save the story. See log.txt for details.");
            }
        }

        public void DeleteStory(int storyId)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "DELETE FROM Stories WHERE StoryID = @id";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("id", storyId);
                command.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                LogError(ex);
                throw new Exception($"Could not delete story ID {storyId}. See log.txt for details.");
            }
        }

        private void LogError(Exception ex)
        {
            string logMessage = $"[{DateTime.Now}] - ERROR: {ex.Message}\nSTACK TRACE: {ex.StackTrace}\n\n";
            File.AppendAllText("log.txt", logMessage);
        }
    }
}